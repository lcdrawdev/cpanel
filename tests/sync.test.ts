import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice } from "@/server/services/devices";
import { createPlaylist } from "@/server/services/playlists";
import { createProfile, updateProfileSettings } from "@/server/services/profiles";
import { activateDevice, deviceConfig } from "@/server/services/device-api";
import { addFavorite, getSyncState, removeFavorite, setDeviceSync, setSyncPlaylists, updateSyncConfig } from "@/server/services/sync";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

async function participant(deviceId = "sync-device-01") {
  const { id } = await addDevice(db, actor, { deviceId, nickname: deviceId });
  await activateDevice(db, { deviceId, platform: "android_tv" });
  await setDeviceSync(db, actor, id, true);
  return id;
}

describe("sync", () => {
  it("is off by default even for participating devices", async () => {
    const id = await participant();
    const pl = await createPlaylist(db, actor, { name: "Pool", type: "m3u", url: "https://exemplo.com/p.m3u" });
    await setSyncPlaylists(db, actor, [pl.id]);
    const config = await deviceConfig(db, id);
    expect(config.sync.enabled).toBe(false);
    expect(config.playlists).toHaveLength(0);
  });

  it("shares pool playlists, the shared profile and favorites with participants only", async () => {
    const a = await participant("sync-device-01");
    const { id: outsider } = await addDevice(db, actor, { deviceId: "sync-device-99", nickname: "Fora" });
    const pl = await createPlaylist(db, actor, { name: "Pool", type: "m3u", url: "https://exemplo.com/p.m3u" });
    const profile = await createProfile(db, actor, { name: "Compartilhado", platform: "tv" });
    await updateProfileSettings(db, actor, profile.id, { clock24h: false });
    await setSyncPlaylists(db, actor, [pl.id]);
    await addFavorite(db, actor, { channelName: "Esporte 1" });
    expect(await addFavorite(db, actor, { channelName: "esporte 1" })).toBe(false);

    const before = (await deviceConfig(db, a)).version;
    await updateSyncConfig(db, actor, { enabled: true, playlists: true, settings: true, favorites: true, profileId: profile.id });
    const config = await deviceConfig(db, a);
    expect(config.version).toBeGreaterThan(before);
    expect(config.sync).toMatchObject({ enabled: true, favorites: [{ channelName: "Esporte 1", playlistId: null }] });
    expect(config.playlists.map((p) => p.name)).toEqual(["Pool"]);
    expect(config.settings.clock24h).toBe(false);

    const other = await deviceConfig(db, outsider);
    expect(other.sync.enabled).toBe(false);
    expect(other.playlists).toHaveLength(0);
  });

  it("requires a profile to sync settings and lets favorites be removed", async () => {
    await expect(updateSyncConfig(db, actor, { enabled: true, playlists: true, settings: true, favorites: true, profileId: null })).rejects.toThrow(/perfil/);
    await addFavorite(db, actor, { channelName: "Canal A" });
    expect(await removeFavorite(db, actor, { channelName: "CANAL A" })).toBe(true);
    expect((await getSyncState(db)).favorites).toHaveLength(0);
  });
});
