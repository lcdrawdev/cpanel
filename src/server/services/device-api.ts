import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/create";
import { activationCodes, devicePlaylists, devices } from "../db/schema";
import { newToken, sha256 } from "../crypto";
import { resolveSettings, settingsSchema } from "@/shared/settings";
import { playlistsByIds, playlistsForDevice } from "./playlists";
import { syncForDevice } from "./sync";
import { applyGroup } from "./groups";
import { accountConfig, getAccountSettings } from "./account-settings";
import { messagesForDevice } from "./messages";
import { artworkConfig } from "./artwork";
import { publishedUpdateFor } from "./app-updates";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import { notify } from "./notifications";

export const activateSchema = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9:_-]{6,64}$/, "deviceId inválido"),
  code: z.string().trim().toUpperCase().min(4).max(16).optional(),
  platform: z.enum(["android_tv", "android_mobile", "apple", "tizen", "webos", "roku", "other"]).default("other"),
  appVersion: z.string().max(32).optional(),
  model: z.string().max(80).optional(),
});

export const heartbeatSchema = z.object({
  appVersion: z.string().max(32).optional(),
  model: z.string().max(80).optional(),
});

/**
 * Device activation, two paths (FLUXOS_FUNCIONAIS §2):
 * - Device ID already registered by an admin → activate it (rotates the token).
 * - Unknown Device ID + valid activation code → create the device with the code's profile and playlists.
 */
export async function activateDevice(db: Database, input: z.infer<typeof activateSchema>) {
  const token = newToken();
  const meta = { platform: input.platform, appVersion: input.appVersion ?? null, model: input.model ?? null, lastSeenAt: new Date() };
  const existing = await db.query.devices.findFirst({ where: eq(devices.deviceId, input.deviceId) });

  if (existing) {
    if (existing.status === "blocked") throw new ServiceError("device_blocked", "Dispositivo bloqueado pelo administrador.", 403);
    // Registered by the TV itself (first access): it only gets a token after the code is confirmed on /ativar.
    if (existing.selfRegistered && existing.status !== "active") throw new ServiceError("awaiting_activation", "Aguardando a ativação pelo site.", 409);
    await db
      .update(devices)
      .set({ ...meta, status: "active", tokenHash: sha256(token), updatedAt: new Date() })
      .where(eq(devices.id, existing.id));
    await audit(db, `device:${input.deviceId}`, "device.activated", existing.id);
    return { token, config: await deviceConfig(db, existing.id) };
  }

  if (!input.code) throw new ServiceError("not_registered", "Dispositivo não cadastrado. Informe um código de ativação ou peça ao administrador para cadastrar o Device ID.", 404);

  const codeInput = input.code;
  return db.transaction(async (tx) => {
    // Consume one use atomically; the WHERE clause enforces limit, expiry and enabled flag.
    const [code] = await tx
      .update(activationCodes)
      .set({ uses: sql`${activationCodes.uses} + 1` })
      .where(
        and(
          eq(activationCodes.code, codeInput.trim().toUpperCase()),
          eq(activationCodes.enabled, true),
          lt(activationCodes.uses, activationCodes.maxUses),
          or(isNull(activationCodes.expiresAt), gt(activationCodes.expiresAt, new Date())),
        ),
      )
      .returning();
    if (!code) throw new ServiceError("invalid_code", "Código inválido, expirado ou sem usos disponíveis.", 400);

    const [device] = await tx
      .insert(devices)
      .values({
        ...meta,
        deviceId: input.deviceId,
        nickname: `${code.label} #${code.uses}`,
        status: "active",
        tokenHash: sha256(token),
        profileId: code.profileId,
        groupId: code.groupId,
        activatedWithCodeId: code.id,
      })
      .returning({ id: devices.id });
    if (code.groupId) {
      await applyGroup(tx, code.groupId, [device.id]);
    } else if (code.playlistIds.length) {
      await tx.insert(devicePlaylists).values(code.playlistIds.map((playlistId) => ({ deviceId: device.id, playlistId })));
    }
    await audit(tx, `device:${input.deviceId}`, "device.activated_with_code", device.id);
    await notify(tx, "device_added", `Novo dispositivo pelo código ${code.code}`, `Um dispositivo (Device ID ${input.deviceId}) foi ativado com o código "${code.label}" (${code.uses}/${code.maxUses} usos).`);
    return { token, config: await deviceConfig(tx, device.id) };
  });
}

/** Resolves the Bearer token to an active device, or throws 401. */
export async function authenticateDevice(db: Database, authorization: string | null) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ServiceError("unauthorized", "Token ausente.", 401);
  const device = await db.query.devices.findFirst({ where: eq(devices.tokenHash, sha256(token)) });
  if (!device || device.status !== "active") throw new ServiceError("unauthorized", "Token inválido ou revogado.", 401);
  return device;
}

/**
 * Configuration version seen by the app. Device and account versions only ever grow,
 * so their sum changes whenever either side changes.
 */
export async function configVersion(db: DbOrTx, device: { configVersion: number }) {
  return device.configVersion + (await getAccountSettings(db)).version;
}

export async function deviceConfig(db: DbOrTx, deviceUuid: string) {
  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceUuid) });
  if (!device) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
  const profile = device.profileId ? await db.query.settingsProfiles.findFirst({ where: (p, { eq }) => eq(p.id, device.profileId!) }) : null;
  const account = await getAccountSettings(db);
  const portals = account.portalMode === "off" ? [] : await db.query.predefinedPortals.findMany({ orderBy: (p, { asc }) => asc(p.name) });
  const sync = await syncForDevice(db, device, account);
  const own = await playlistsForDevice(db, device.id);
  // Sync pool playlists are added to the device's own (no duplicates); a shared profile replaces the device profile.
  const shared = sync.active ? (await playlistsByIds(db, sync.poolPlaylistIds)).filter((p) => !own.some((o) => o.id === p.id)) : [];
  return {
    version: device.configVersion + account.version,
    device: {
      nickname: device.nickname, customerName: device.customerName || null,
      // The TV shows the due-date warning in the bell from expiryNoticeDays before.
      planExpiresAt: device.planExpiresAt?.toISOString() ?? null, expiryNoticeDays: device.expiryNoticeDays,
    },
    account: accountConfig(account, portals),
    // Device-only overrides win over the (shared or own) profile.
    settings: { ...resolveSettings((sync.active && sync.profile ? sync.profile : profile)?.settings), ...settingsSchema.parse(device.settingsOverrides ?? {}) },
    playlists: [...own, ...shared],
    sync: sync.active ? { enabled: true, types: sync.types, favorites: sync.favorites } : { enabled: false },
    messages: await messagesForDevice(db, device),
    // Service logos and folder covers linked in Capas e logos.
    artwork: await artworkConfig(db),
    // Published app update for this device's platform (the TV compares versionCode and offers to install).
    // The app is a single Android APK for TV and phone, and some devices register as "other" before the
    // first full handshake, so any Android-family device falls back to the Android TV package.
    update: await updateForDevice(db, device.platform),
  };
}

const ANDROID_PLATFORMS = new Set(["android_tv", "android_mobile", "other"]);
async function updateForDevice(db: DbOrTx, platform: string) {
  const own = await publishedUpdateFor(db, platform as never);
  if (own) return own;
  return ANDROID_PLATFORMS.has(platform) ? publishedUpdateFor(db, "android_tv") : null;
}

export async function heartbeat(db: Database, deviceUuid: string, input: z.infer<typeof heartbeatSchema>) {
  await db
    .update(devices)
    .set({ lastSeenAt: new Date(), ...(input.appVersion ? { appVersion: input.appVersion } : {}), ...(input.model ? { model: input.model } : {}) })
    .where(eq(devices.id, deviceUuid));
}
