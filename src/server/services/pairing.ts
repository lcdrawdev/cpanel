import { randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/create";
import { devices } from "../db/schema";
import { sha256 } from "../crypto";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import { notify } from "./notifications";

// ---------- First access (Ativação do Dispositivo) ----------
// The TV asks for a pairing: it gets a MAC-style id (from its Device ID) and a 6-digit code valid for
// 15 minutes. The customer types both on the public /ativar page; the TV keeps asking for its token and
// enters the app as soon as the device is active. The code is stored only as a hash, five wrong tries
// lock it (the TV then shows a new one) and each address is limited to a few tries a minute.

const CODE_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

export const pairingSchema = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9:_-]{6,64}$/, "deviceId inválido"),
  platform: z.enum(["android_tv", "android_mobile", "apple", "tizen", "webos", "roku", "other"]).default("other"),
  appVersion: z.string().max(32).optional(),
  model: z.string().max(80).optional(),
});

/** Stable MAC-style id of a Device ID ("00:1A:2B:3C:4D:5E"): Android no longer exposes the real MAC to apps. */
export function macFor(deviceId: string) {
  return sha256(`mac:${deviceId}`).slice(0, 12).toUpperCase().match(/../g)!.join(":");
}

export function normalizeMac(input: string) {
  const hex = input.toUpperCase().replace(/[^0-9A-F]/g, "");
  return hex.length === 12 ? hex.match(/../g)!.join(":") : null;
}

const hashCode = (deviceId: string, code: string) => sha256(`pair:${deviceId}:${code}`);

/**
 * The TV's first access: a new (or still waiting) device gets a fresh 6-digit code. An already active
 * device gets `{ status: "active" }` and simply asks for its token.
 */
export async function startPairing(db: Database, input: z.infer<typeof pairingSchema>, activationUrl: string) {
  const mac = macFor(input.deviceId);
  const existing = await db.query.devices.findFirst({ where: eq(devices.deviceId, input.deviceId) });
  if (existing?.status === "blocked") throw new ServiceError("device_blocked", "Dispositivo bloqueado pelo administrador.", 403);
  if (existing && (existing.status === "active" || !existing.selfRegistered)) return { status: existing.status === "active" ? "active" : "registered", mac };

  const code = String(randomInt(100_000, 1_000_000));
  const values = {
    mac, selfRegistered: true, pairingCodeHash: hashCode(input.deviceId, code), pairingExpiresAt: new Date(Date.now() + CODE_TTL_MS), pairingAttempts: 0,
    platform: input.platform, appVersion: input.appVersion ?? null, model: input.model ?? null, updatedAt: new Date(),
  };
  if (existing) await db.update(devices).set(values).where(eq(devices.id, existing.id));
  else await db.insert(devices).values({ ...values, deviceId: input.deviceId, nickname: `TV ${mac.slice(-8)}`, status: "pending" });
  return { status: "waiting", mac, code, expiresInSec: CODE_TTL_MS / 1000, url: activationUrl };
}

// Tries per address in the last minute (in memory: one panel process).
const tries = new Map<string, number[]>();
function limit(ip: string) {
  const now = Date.now();
  const recent = (tries.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) throw new ServiceError("rate_limited", "Muitas tentativas. Aguarde um minuto e tente de novo.", 429);
  recent.push(now);
  tries.set(ip, recent);
}

/** The /ativar page: MAC + code shown on the TV. Right → the device becomes active and the TV enters by itself. */
export async function confirmPairing(db: Database, macInput: string, codeInput: string, ip: string) {
  limit(ip);
  const mac = normalizeMac(macInput);
  const code = codeInput.replace(/\D/g, "");
  if (!mac || code.length !== 6) throw new ServiceError("invalid", "Confira o endereço MAC e o código de 6 números mostrados na TV.");
  const device = await db.query.devices.findFirst({ where: eq(devices.mac, mac) });
  const wrong = new ServiceError("invalid_code", "Endereço MAC ou código incorretos. Confira na TV e tente de novo.");
  if (!device || !device.selfRegistered || !device.pairingCodeHash) throw wrong;
  if (device.status === "blocked") throw new ServiceError("device_blocked", "Este aparelho está bloqueado. Fale com o suporte.", 403);
  if (!device.pairingExpiresAt || device.pairingExpiresAt.getTime() < Date.now()) throw new ServiceError("expired", "O código expirou. A TV já mostra um novo: use o código atual.");
  if (device.pairingAttempts >= MAX_ATTEMPTS) throw new ServiceError("locked", "Muitas tentativas erradas. Feche e abra o app na TV para gerar outro código.");
  const ok = timingSafeEqual(Buffer.from(device.pairingCodeHash), Buffer.from(hashCode(device.deviceId, code)));
  if (!ok) {
    await db.update(devices).set({ pairingAttempts: device.pairingAttempts + 1 }).where(eq(devices.id, device.id));
    throw wrong;
  }
  await db.update(devices).set({ status: "active", selfRegistered: false, pairingCodeHash: null, pairingExpiresAt: null, pairingAttempts: 0, updatedAt: new Date() }).where(eq(devices.id, device.id));
  await audit(db, `site:${ip}`, "device.activated_by_site", device.id);
  await notify(db, "device_added", "Novo aparelho ativado pelo site", `O aparelho ${device.nickname} (MAC ${mac}) foi ativado pela página de ativação.`);
  return { nickname: device.nickname };
}
