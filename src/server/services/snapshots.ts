import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/create";
import { devicePlaylists, devices, deviceSnapshots, playlists, settingsProfiles } from "../db/schema";
import { ServiceError } from "./errors";
import { audit } from "./audit";

type SnapshotData = (typeof deviceSnapshots.$inferSelect)["data"];

export async function listSnapshots(db: Database) {
  return db.select().from(deviceSnapshots).orderBy(desc(deviceSnapshots.createdAt));
}

async function captureDevice(db: DbOrTx, deviceUuid: string) {
  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceUuid) });
  if (!device) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
  const links = await db.select({ id: devicePlaylists.playlistId }).from(devicePlaylists).where(eq(devicePlaylists.deviceId, deviceUuid));
  const data: SnapshotData = { profileId: device.profileId, playlistIds: links.map((l) => l.id), settingsOverrides: device.settingsOverrides };
  return { device, data };
}

/** Writes a captured configuration onto a device; ignores playlists or profiles deleted since. */
async function applyData(tx: DbOrTx, deviceUuid: string, data: SnapshotData) {
  const target = await tx.query.devices.findFirst({ where: eq(devices.id, deviceUuid) });
  if (!target) throw new ServiceError("not_found", "Dispositivo de destino não encontrado.", 404);
  const validPlaylists = data.playlistIds.length
    ? (await tx.select({ id: playlists.id }).from(playlists).where(inArray(playlists.id, data.playlistIds))).map((p) => p.id)
    : [];
  const profileExists = data.profileId ? await tx.query.settingsProfiles.findFirst({ where: eq(settingsProfiles.id, data.profileId) }) : null;
  await tx.delete(devicePlaylists).where(eq(devicePlaylists.deviceId, deviceUuid));
  if (validPlaylists.length) await tx.insert(devicePlaylists).values(validPlaylists.map((playlistId) => ({ deviceId: deviceUuid, playlistId })));
  await tx
    .update(devices)
    .set({ profileId: profileExists ? data.profileId : null, settingsOverrides: data.settingsOverrides, configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() })
    .where(eq(devices.id, deviceUuid));
}

export async function createSnapshot(db: Database, actor: string, deviceUuid: string, name: string) {
  const label = name.trim();
  if (!label) throw new ServiceError("invalid", "Dê um nome ao snapshot.");
  const { device, data } = await captureDevice(db, deviceUuid);
  const [row] = await db.insert(deviceSnapshots).values({ name: label.slice(0, 80), sourceNickname: device.nickname, data }).returning();
  await audit(db, actor, "snapshot.created", row.id);
  return row;
}

export async function restoreSnapshot(db: Database, actor: string, snapshotId: string, targetUuid: string) {
  const snap = await db.query.deviceSnapshots.findFirst({ where: eq(deviceSnapshots.id, snapshotId) });
  if (!snap) throw new ServiceError("not_found", "Snapshot não encontrado.", 404);
  await db.transaction((tx) => applyData(tx, targetUuid, snap.data));
  await audit(db, actor, "snapshot.restored", targetUuid);
}

/** Device-to-device copy: playlists, profile and device-only settings. */
export async function copyDevice(db: Database, actor: string, sourceUuid: string, targetUuid: string) {
  if (sourceUuid === targetUuid) throw new ServiceError("invalid", "Escolha um dispositivo diferente como origem.");
  const { data } = await captureDevice(db, sourceUuid);
  await db.transaction((tx) => applyData(tx, targetUuid, data));
  await audit(db, actor, "device.copied", targetUuid);
}

export async function deleteSnapshot(db: Database, actor: string, id: string) {
  await db.delete(deviceSnapshots).where(eq(deviceSnapshots.id, id));
  await audit(db, actor, "snapshot.deleted", id);
}
