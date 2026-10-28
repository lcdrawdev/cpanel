import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/create";
import { devices, playlists, settingsProfiles, syncFavorites, syncPlaylists } from "../db/schema";
import { getAccountSettings, save } from "./account-settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

/** Everything the sync pages need in one read. */
export async function getSyncState(db: Database) {
  const [account, participants, pool, favorites] = await Promise.all([
    getAccountSettings(db),
    db
      .select({ id: devices.id, nickname: devices.nickname, deviceId: devices.deviceId, platform: devices.platform, status: devices.status, syncEnabled: devices.syncEnabled, groupId: devices.groupId })
      .from(devices)
      .orderBy(asc(devices.nickname)),
    db.select({ playlistId: syncPlaylists.playlistId }).from(syncPlaylists),
    listFavorites(db),
  ]);
  return { account, devices: participants, poolPlaylistIds: pool.map((p) => p.playlistId), favorites };
}

export const syncConfigSchema = z.object({
  enabled: z.boolean(),
  playlists: z.boolean(),
  settings: z.boolean(),
  favorites: z.boolean(),
  profileId: z.string().uuid().nullable(),
});

export async function updateSyncConfig(db: Database, actor: string, input: z.input<typeof syncConfigSchema>) {
  const v = syncConfigSchema.parse(input);
  if (v.settings && !v.profileId) throw new ServiceError("invalid", "Para sincronizar configurações, escolha o perfil que será compartilhado.");
  await getAccountSettings(db);
  await save(db, { syncEnabled: v.enabled, syncPlaylists: v.playlists, syncSettings: v.settings, syncFavorites: v.favorites, syncProfileId: v.profileId });
  await audit(db, actor, v.enabled ? "sync.enabled" : "sync.updated");
}

export async function setDeviceSync(db: Database, actor: string, deviceUuid: string, enabled: boolean) {
  const [row] = await db
    .update(devices)
    .set({ syncEnabled: enabled, configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() })
    .where(eq(devices.id, deviceUuid))
    .returning({ id: devices.id });
  if (!row) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
  await audit(db, actor, enabled ? "sync.device_joined" : "sync.device_left", deviceUuid);
}

export async function setSyncPlaylists(db: Database, actor: string, playlistIds: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(syncPlaylists);
    const ids = [...new Set(playlistIds)];
    if (ids.length) await tx.insert(syncPlaylists).values(ids.map((playlistId) => ({ playlistId })));
    await getAccountSettings(tx);
    await save(tx, {});
  });
  await audit(db, actor, "sync.playlists_set");
}

export async function listFavorites(db: DbOrTx) {
  return db
    .select({ id: syncFavorites.id, channelName: syncFavorites.channelName, playlistId: syncFavorites.playlistId, playlistName: playlists.name, createdAt: syncFavorites.createdAt })
    .from(syncFavorites)
    .leftJoin(playlists, eq(playlists.id, syncFavorites.playlistId))
    .orderBy(asc(syncFavorites.channelName));
}

const favoriteSchema = z.object({ channelName: z.string().trim().min(1, "Informe o nome do canal.").max(120), playlistId: z.string().uuid().nullable().optional() });

/** Adds a favorite unless the same channel (case-insensitive, same playlist) is already there. */
export async function addFavorite(db: DbOrTx, actor: string, input: z.input<typeof favoriteSchema>) {
  const v = favoriteSchema.safeParse(input);
  if (!v.success) throw new ServiceError("invalid", v.error.issues[0].message);
  const playlistId = v.data.playlistId ?? null;
  const exists = await db.query.syncFavorites.findFirst({
    where: and(eq(sql`lower(${syncFavorites.channelName})`, v.data.channelName.toLowerCase()), playlistId ? eq(syncFavorites.playlistId, playlistId) : isNull(syncFavorites.playlistId)),
  });
  if (exists) return false;
  await db.insert(syncFavorites).values({ channelName: v.data.channelName, playlistId });
  await getAccountSettings(db);
  await save(db, {});
  await audit(db, actor, "sync.favorite_added");
  return true;
}

export async function removeFavorite(db: DbOrTx, actor: string, where: { id: string } | { channelName: string }) {
  const cond = "id" in where ? eq(syncFavorites.id, where.id) : eq(sql`lower(${syncFavorites.channelName})`, where.channelName.toLowerCase());
  const removed = await db.delete(syncFavorites).where(cond).returning({ id: syncFavorites.id });
  if (!removed.length) return false;
  await getAccountSettings(db);
  await save(db, {});
  await audit(db, actor, "sync.favorite_removed");
  return true;
}

/** What sync adds to a device configuration (see device-api.ts). */
export async function syncForDevice(db: DbOrTx, device: { syncEnabled: boolean }, account: Awaited<ReturnType<typeof getAccountSettings>>) {
  if (!account.syncEnabled || !device.syncEnabled) return { active: false as const };
  const [pool, favorites, profile] = await Promise.all([
    account.syncPlaylists ? db.select({ playlistId: syncPlaylists.playlistId }).from(syncPlaylists) : Promise.resolve([]),
    account.syncFavorites ? listFavorites(db) : Promise.resolve([]),
    account.syncSettings && account.syncProfileId ? db.query.settingsProfiles.findFirst({ where: eq(settingsProfiles.id, account.syncProfileId) }) : Promise.resolve(null),
  ]);
  return {
    active: true as const,
    types: { playlists: account.syncPlaylists, settings: account.syncSettings, favorites: account.syncFavorites },
    poolPlaylistIds: pool.map((p) => p.playlistId),
    favorites: favorites.map(({ channelName, playlistId }) => ({ channelName, playlistId })),
    profile: profile ?? null,
  };
}
