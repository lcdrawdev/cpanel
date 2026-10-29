import { and, asc, count, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import type { Database } from "../db/create";
import { deviceGroups, devicePlaylists, devices, playlists, settingsProfiles } from "../db/schema";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import { notify } from "./notifications";

/** A device counts as online when it called the API in the last few minutes. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

const DEVICE_ID_RE = /^[A-Za-z0-9:_-]{6,64}$/;

export async function listDevices(db: Database, search?: string) {
  const q = search?.trim();
  const rows = await db
    .select({
      id: devices.id,
      deviceId: devices.deviceId,
      nickname: devices.nickname,
      platform: devices.platform,
      status: devices.status,
      appVersion: devices.appVersion,
      lastSeenAt: devices.lastSeenAt,
      profileId: devices.profileId,
      profileName: settingsProfiles.name,
    })
    .from(devices)
    .leftJoin(settingsProfiles, eq(settingsProfiles.id, devices.profileId))
    .where(q ? or(ilike(devices.nickname, `%${q}%`), ilike(devices.deviceId, `%${q}%`), ilike(settingsProfiles.name, `%${q}%`)) : undefined)
    .orderBy(asc(devices.nickname));
  const now = Date.now();
  return rows.map((d) => ({ ...d, online: isOnline(d.lastSeenAt, now) }));
}

export function isOnline(lastSeenAt: Date | null, now = Date.now()) {
  return lastSeenAt ? now - lastSeenAt.getTime() < ONLINE_WINDOW_MS : false;
}

export async function deviceStats(db: Database) {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [row] = await db
    .select({
      total: count(),
      active: count(sql`case when ${devices.status} = 'active' then 1 end`),
      pending: count(sql`case when ${devices.status} = 'pending' then 1 end`),
      blocked: count(sql`case when ${devices.status} = 'blocked' then 1 end`),
      online: count(sql`case when ${devices.lastSeenAt} > ${since} then 1 end`),
    })
    .from(devices);
  return row;
}

export async function getDevice(db: Database, id: string) {
  const device = await db.query.devices.findFirst({ where: eq(devices.id, id) });
  if (!device) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
  const linked = await db
    .select({ id: playlists.id, name: playlists.name, type: playlists.type, url: playlists.url, updatedAt: playlists.updatedAt })
    .from(devicePlaylists)
    .innerJoin(playlists, eq(playlists.id, devicePlaylists.playlistId))
    .where(eq(devicePlaylists.deviceId, id))
    .orderBy(asc(playlists.name));
  const profile = device.profileId ? await db.query.settingsProfiles.findFirst({ where: eq(settingsProfiles.id, device.profileId) }) : null;
  const group = device.groupId ? await db.query.deviceGroups.findFirst({ where: eq(deviceGroups.id, device.groupId) }) : null;
  return { ...device, tokenHash: undefined, hasToken: Boolean(device.tokenHash), playlists: linked, profile: profile ?? null, group: group ?? null };
}

/** Admin registers a Device ID shown by the app ("Add New Device" in the reference panel). */
export async function addDevice(db: Database, actor: string, input: { deviceId: string; nickname: string }) {
  const deviceId = input.deviceId.trim();
  const nickname = input.nickname.trim();
  if (!DEVICE_ID_RE.test(deviceId)) throw new ServiceError("invalid_device_id", "Device ID inválido: use de 6 a 64 letras, números, ':', '_' ou '-'.");
  if (!nickname) throw new ServiceError("invalid", "Informe um apelido.");
  const existing = await db.query.devices.findFirst({ where: eq(devices.deviceId, deviceId) });
  if (existing) throw new ServiceError("duplicate", "Este Device ID já está cadastrado.", 409);
  const [device] = await db.insert(devices).values({ deviceId, nickname }).returning({ id: devices.id });
  await audit(db, actor, "device.added", device.id);
  await notify(db, "device_added", `Dispositivo adicionado: ${nickname}`, `O dispositivo "${nickname}" (Device ID ${deviceId}) foi cadastrado por ${actor}.`);
  return device;
}

/** Nickname (panel) and the user's name shown on the app profile. */
export async function renameDevice(db: Database, actor: string, id: string, nickname: string, customerName?: string) {
  if (!nickname.trim()) throw new ServiceError("invalid", "Informe um apelido.");
  if ((customerName ?? "").trim().length > 40) throw new ServiceError("invalid", "O nome do usuário aceita até 40 caracteres.");
  await touch(db, id, { nickname: nickname.trim(), ...(customerName !== undefined ? { customerName: customerName.trim() } : {}) });
  await audit(db, actor, "device.renamed", id);
}

export const EXPIRY_NOTICE_DAYS = [5, 3, 2] as const;

/**
 * Due date of the customer's plan ("YYYY-MM-DD", empty to clear) and how many days before it the TV
 * warns (bell message). The plan lasts until the end of that day in Brasília time.
 */
export async function setDevicePlan(db: Database, actor: string, id: string, date: string, noticeDays: number) {
  if (!EXPIRY_NOTICE_DAYS.includes(noticeDays as (typeof EXPIRY_NOTICE_DAYS)[number])) throw new ServiceError("invalid", "Escolha avisar com 5, 3 ou 2 dias de antecedência.");
  let planExpiresAt: Date | null = null;
  const day = date.trim();
  if (day) {
    planExpiresAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T23:59:59-03:00`) : new Date(NaN);
    if (Number.isNaN(planExpiresAt.getTime())) throw new ServiceError("invalid", "Data de vencimento inválida.");
  }
  await touch(db, id, { planExpiresAt, expiryNoticeDays: noticeDays });
  await audit(db, actor, "device.plan_set", id);
}

export async function setDeviceProfile(db: Database, actor: string, id: string, profileId: string | null) {
  await touch(db, id, { profileId });
  await audit(db, actor, "device.profile_set", id);
}

export async function setDevicePlaylists(db: Database, actor: string, id: string, playlistIds: string[]) {
  await getDevice(db, id);
  await db.transaction(async (tx) => {
    await tx.delete(devicePlaylists).where(eq(devicePlaylists.deviceId, id));
    if (playlistIds.length) await tx.insert(devicePlaylists).values(playlistIds.map((playlistId) => ({ deviceId: id, playlistId })));
  });
  await touch(db, id, {});
  await audit(db, actor, "device.playlists_set", id);
}

/** Blocking also revokes the token, so the app loses access on its next call. */
export async function setDeviceBlocked(db: Database, actor: string, id: string, blocked: boolean) {
  const device = await getDevice(db, id);
  await touch(db, id, blocked ? { status: "blocked", tokenHash: null } : { status: device.hasToken ? "active" : "pending" });
  await audit(db, actor, blocked ? "device.blocked" : "device.unblocked", id);
}

export async function removeDevice(db: Database, actor: string, id: string) {
  const [removed] = await db.delete(devices).where(eq(devices.id, id)).returning({ nickname: devices.nickname, deviceId: devices.deviceId });
  await audit(db, actor, "device.removed", id);
  if (removed) await notify(db, "device_removed", `Dispositivo removido: ${removed.nickname}`, `O dispositivo "${removed.nickname}" (Device ID ${removed.deviceId}) foi removido por ${actor}.`);
}

export async function recentlySeen(db: Database, limit = 5) {
  return db
    .select({ id: devices.id, nickname: devices.nickname, lastSeenAt: devices.lastSeenAt })
    .from(devices)
    .where(gt(devices.lastSeenAt, new Date(0)))
    .orderBy(desc(devices.lastSeenAt))
    .limit(limit);
}

/** Any admin change to a device bumps its config version so the app refetches. */
async function touch(db: Database, id: string, values: Partial<typeof devices.$inferInsert>) {
  const [row] = await db
    .update(devices)
    .set({ ...values, configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() })
    .where(and(eq(devices.id, id)))
    .returning({ id: devices.id });
  if (!row) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
}
