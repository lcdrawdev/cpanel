import { asc, count, eq, inArray, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/create";
import { deviceGroups, devicePlaylists, devices, playlists, settingsProfiles } from "../db/schema";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export type GroupInput = { name: string; profileId: string | null; playlistIds: string[] };

export async function listGroups(db: Database) {
  return db
    .select({
      id: deviceGroups.id,
      name: deviceGroups.name,
      profileName: settingsProfiles.name,
      playlistIds: deviceGroups.playlistIds,
      updatedAt: deviceGroups.updatedAt,
      deviceCount: count(devices.id),
    })
    .from(deviceGroups)
    .leftJoin(settingsProfiles, eq(settingsProfiles.id, deviceGroups.profileId))
    .leftJoin(devices, eq(devices.groupId, deviceGroups.id))
    .groupBy(deviceGroups.id, settingsProfiles.name)
    .orderBy(asc(deviceGroups.name));
}

export async function getGroup(db: Database, id: string) {
  const group = await db.query.deviceGroups.findFirst({ where: eq(deviceGroups.id, id) });
  if (!group) throw new ServiceError("not_found", "Grupo não encontrado.", 404);
  const members = await db
    .select({ id: devices.id, nickname: devices.nickname, deviceId: devices.deviceId, status: devices.status, lastSeenAt: devices.lastSeenAt })
    .from(devices)
    .where(eq(devices.groupId, id))
    .orderBy(asc(devices.nickname));
  return { ...group, members };
}

function validate(input: GroupInput) {
  const name = input.name.trim();
  if (!name) throw new ServiceError("invalid", "Informe um nome para o grupo.");
  return { name, profileId: input.profileId, playlistIds: [...new Set(input.playlistIds)] };
}

export async function createGroup(db: Database, actor: string, input: GroupInput) {
  const [group] = await db.insert(deviceGroups).values(validate(input)).returning();
  await audit(db, actor, "group.created", group.id);
  return group;
}

/** Saving a group re-applies its profile and playlists to every member. */
export async function updateGroup(db: Database, actor: string, id: string, input: GroupInput) {
  await db.transaction(async (tx) => {
    const [group] = await tx
      .update(deviceGroups)
      .set({ ...validate(input), updatedAt: new Date() })
      .where(eq(deviceGroups.id, id))
      .returning({ id: deviceGroups.id });
    if (!group) throw new ServiceError("not_found", "Grupo não encontrado.", 404);
    const members = await tx.select({ id: devices.id }).from(devices).where(eq(devices.groupId, id));
    await applyGroup(tx, id, members.map((m) => m.id));
  });
  await audit(db, actor, "group.updated", id);
}

/** Moves a device into a group (or out of any group with `null`). Joining applies the group configuration. */
export async function setDeviceGroup(db: Database, actor: string, deviceUuid: string, groupId: string | null) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(devices)
      .set({ groupId, configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() })
      .where(eq(devices.id, deviceUuid))
      .returning({ id: devices.id });
    if (!row) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
    if (groupId) await applyGroup(tx, groupId, [deviceUuid]);
  });
  await audit(db, actor, groupId ? "device.group_set" : "device.group_cleared", deviceUuid);
}

/** Members keep their current configuration; they just stop belonging to the group. */
export async function deleteGroup(db: Database, actor: string, id: string) {
  await db.delete(deviceGroups).where(eq(deviceGroups.id, id));
  await audit(db, actor, "group.deleted", id);
}

/** Copies the group profile and playlists onto the given devices and bumps their config version. */
export async function applyGroup(tx: DbOrTx, groupId: string, deviceUuids: string[]) {
  if (!deviceUuids.length) return;
  const group = await tx.query.deviceGroups.findFirst({ where: eq(deviceGroups.id, groupId) });
  if (!group) throw new ServiceError("not_found", "Grupo não encontrado.", 404);
  // Ignore playlists deleted since the group was saved.
  const existing = group.playlistIds.length
    ? (await tx.select({ id: playlists.id }).from(playlists).where(inArray(playlists.id, group.playlistIds))).map((p) => p.id)
    : [];
  await tx.delete(devicePlaylists).where(inArray(devicePlaylists.deviceId, deviceUuids));
  if (existing.length) {
    await tx.insert(devicePlaylists).values(deviceUuids.flatMap((deviceId) => existing.map((playlistId) => ({ deviceId, playlistId }))));
  }
  await tx
    .update(devices)
    .set({ profileId: group.profileId, configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() })
    .where(inArray(devices.id, deviceUuids));
}
