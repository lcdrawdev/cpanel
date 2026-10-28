import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/create";
import { devicePlaylists, devices, playlists, predefinedPortals } from "../db/schema";
import { decryptSecret, encryptSecret } from "../crypto";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export type PlaylistInput = {
  name: string;
  type: "xtream" | "m3u";
  url: string;
  username?: string;
  /** Empty on edit keeps the stored password. */
  password?: string;
};

/** Admin listing: never returns credentials, only whether they are set. */
export async function listPlaylists(db: Database) {
  return db
    .select({
      id: playlists.id,
      name: playlists.name,
      type: playlists.type,
      url: playlists.url,
      hasCredentials: sql<boolean>`${playlists.usernameEnc} is not null`,
      updatedAt: playlists.updatedAt,
      deviceCount: count(devicePlaylists.deviceId),
    })
    .from(playlists)
    .leftJoin(devicePlaylists, eq(devicePlaylists.playlistId, playlists.id))
    .groupBy(playlists.id)
    .orderBy(asc(playlists.name));
}

function validate(input: PlaylistInput) {
  const name = input.name.trim();
  if (!name) throw new ServiceError("invalid", "Informe um nome.");
  let url: URL;
  try {
    url = new URL(input.url.trim());
  } catch {
    throw new ServiceError("invalid_url", "URL inválida. Use o endereço completo, com http:// ou https://.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ServiceError("invalid_url", "A URL deve começar com http:// ou https://.");
  if (url.username || url.password) throw new ServiceError("invalid_url", "Não coloque usuário e senha na URL; use os campos próprios.");
  return { name, url: url.toString() };
}

export async function createPlaylist(db: Database, actor: string, input: PlaylistInput) {
  const { name, url } = validate(input);
  if (input.type === "xtream" && (!input.username?.trim() || !input.password)) throw new ServiceError("invalid", "Playlists XC exigem usuário e senha.");
  const [row] = await db
    .insert(playlists)
    .values({
      name,
      url,
      type: input.type,
      usernameEnc: input.username?.trim() ? encryptSecret(input.username.trim()) : null,
      passwordEnc: input.password ? encryptSecret(input.password) : null,
    })
    .returning({ id: playlists.id });
  await audit(db, actor, "playlist.created", row.id);
  return row;
}

export async function updatePlaylist(db: Database, actor: string, id: string, input: PlaylistInput) {
  const { name, url } = validate(input);
  const current = await db.query.playlists.findFirst({ where: eq(playlists.id, id) });
  if (!current) throw new ServiceError("not_found", "Playlist não encontrada.", 404);
  const values: Partial<typeof playlists.$inferInsert> = { name, url, type: input.type, updatedAt: new Date() };
  if (input.type === "m3u") {
    values.usernameEnc = null;
    values.passwordEnc = null;
  } else {
    // Blank fields keep the stored credentials (the admin UI never shows them back).
    if (input.username?.trim()) values.usernameEnc = encryptSecret(input.username.trim());
    if (input.password) values.passwordEnc = encryptSecret(input.password);
    if (!(values.usernameEnc ?? current.usernameEnc) || !(values.passwordEnc ?? current.passwordEnc)) {
      throw new ServiceError("invalid", "Playlists XC exigem usuário e senha.");
    }
  }
  const [row] = await db.update(playlists).set(values).where(eq(playlists.id, id)).returning({ id: playlists.id });
  if (!row) throw new ServiceError("not_found", "Playlist não encontrada.", 404);
  await bumpDevicesUsing(db, id);
  await audit(db, actor, "playlist.updated", id);
}

export async function deletePlaylist(db: Database, actor: string, id: string) {
  await bumpDevicesUsing(db, id);
  await db.delete(playlists).where(eq(playlists.id, id));
  await audit(db, actor, "playlist.deleted", id);
}

async function bumpDevicesUsing(db: Database, playlistId: string) {
  const linked = db.select({ id: devicePlaylists.deviceId }).from(devicePlaylists).where(eq(devicePlaylists.playlistId, playlistId));
  await db.update(devices).set({ configVersion: sql`${devices.configVersion} + 1` }).where(inArray(devices.id, linked));
}

/** XC server addresses the admin already knows: XC playlists and predefined XC portals. */
export async function knownXtreamServers(db: Database) {
  const fromPlaylists = await db.select({ url: playlists.url }).from(playlists).where(eq(playlists.type, "xtream"));
  const fromPortals = await db.select({ url: predefinedPortals.url }).from(predefinedPortals).where(eq(predefinedPortals.type, "xtream"));
  return [...new Set([...fromPlaylists, ...fromPortals].map((r) => r.url))].sort();
}

/** Logs in on the XC server (player_api.php) to check the credentials before sending them to the TV. */
async function checkXtreamLogin(server: string, username: string, password: string) {
  const api = new URL("player_api.php", server.endsWith("/") ? server : `${server}/`);
  api.searchParams.set("username", username);
  api.searchParams.set("password", password);
  let res: Response;
  try {
    res = await fetch(api, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new ServiceError("xtream_unreachable", "Não consegui falar com o servidor XC. Confira a URL e tente de novo.");
  }
  // Many XC panels answer a wrong login with 401/403/404 and an empty body instead of auth: 0.
  if ([401, 403, 404].includes(res.status)) throw new ServiceError("xtream_auth", "O servidor recusou o login: confira usuário e senha.");
  let body: { user_info?: { auth?: number | string; status?: string } };
  try {
    body = await res.json();
  } catch {
    throw new ServiceError("xtream_unreachable", `O servidor XC respondeu algo inesperado (HTTP ${res.status}). Confira a URL do portal.`);
  }
  if (String(body.user_info?.auth) !== "1") throw new ServiceError("xtream_auth", "O servidor recusou o login: confira usuário e senha.");
  const status = body.user_info?.status;
  if (status && status.toLowerCase() !== "active") throw new ServiceError("xtream_status", `A conta XC está com status "${status}" no servidor.`);
}

/**
 * Device panel "Conectar": checks the XC login and delivers it to this TV only. Reuses the
 * device's own XC playlist for the same server (one linked to no other device); a shared
 * playlist for that server is swapped for a new one, so other devices are not affected.
 */
export async function connectDeviceXtream(db: Database, actor: string, deviceUuid: string, input: { url: string; username: string; password: string }) {
  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceUuid) });
  if (!device) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
  const username = input.username.trim();
  if (!username || !input.password) throw new ServiceError("invalid", "Informe usuário e senha.");
  const { url } = validate({ name: "x", type: "xtream", url: input.url });
  await checkXtreamLogin(url, username, input.password);

  const linked = await db
    .select({ id: playlists.id, devicesUsing: sql<number>`(select count(*) from ${devicePlaylists} dp where dp.playlist_id = ${playlists.id})` })
    .from(devicePlaylists)
    .innerJoin(playlists, eq(playlists.id, devicePlaylists.playlistId))
    .where(and(eq(devicePlaylists.deviceId, deviceUuid), eq(playlists.type, "xtream"), eq(playlists.url, url)));
  const own = linked.find((p) => Number(p.devicesUsing) === 1);
  const credentials = { usernameEnc: encryptSecret(username), passwordEnc: encryptSecret(input.password), updatedAt: new Date() };

  await db.transaction(async (tx) => {
    if (own) {
      await tx.update(playlists).set(credentials).where(eq(playlists.id, own.id));
    } else {
      const [row] = await tx.insert(playlists).values({ name: `Acesso ${device.nickname}`, type: "xtream", url, ...credentials }).returning({ id: playlists.id });
      const shared = linked.map((p) => p.id);
      if (shared.length) await tx.delete(devicePlaylists).where(and(eq(devicePlaylists.deviceId, deviceUuid), inArray(devicePlaylists.playlistId, shared)));
      await tx.insert(devicePlaylists).values({ deviceId: deviceUuid, playlistId: row.id });
    }
    await tx.update(devices).set({ configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() }).where(eq(devices.id, deviceUuid));
  });
  await audit(db, actor, "device.xtream_connected", deviceUuid);
}

/** Decrypted playlists for the device API only. */
export async function playlistsForDevice(db: DbOrTx, deviceUuid: string) {
  const rows = await db
    .select({ id: playlists.id, name: playlists.name, type: playlists.type, url: playlists.url, usernameEnc: playlists.usernameEnc, passwordEnc: playlists.passwordEnc })
    .from(devicePlaylists)
    .innerJoin(playlists, eq(playlists.id, devicePlaylists.playlistId))
    .where(eq(devicePlaylists.deviceId, deviceUuid))
    .orderBy(asc(playlists.name));
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    url: p.url,
    username: p.usernameEnc ? decryptSecret(p.usernameEnc) : null,
    password: p.passwordEnc ? decryptSecret(p.passwordEnc) : null,
  }));
}

/** Decrypted playlists by id (sync pool), for the device API only. */
export async function playlistsByIds(db: DbOrTx, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: playlists.id, name: playlists.name, type: playlists.type, url: playlists.url, usernameEnc: playlists.usernameEnc, passwordEnc: playlists.passwordEnc })
    .from(playlists)
    .where(inArray(playlists.id, ids))
    .orderBy(asc(playlists.name));
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    url: p.url,
    username: p.usernameEnc ? decryptSecret(p.usernameEnc) : null,
    password: p.passwordEnc ? decryptSecret(p.passwordEnc) : null,
  }));
}
