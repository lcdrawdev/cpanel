import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice, getDevice, setDevicePlaylists, setDeviceProfile } from "@/server/services/devices";
import { createPlaylist, deletePlaylist } from "@/server/services/playlists";
import { createProfile, updateProfileSettings } from "@/server/services/profiles";
import { deviceConfig } from "@/server/services/device-api";
import { clearDeviceOverrides, setDeviceOverrides } from "@/server/services/device-settings";
import { copyDevice, createSnapshot, listSnapshots, restoreSnapshot } from "@/server/services/snapshots";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("device-only settings", () => {
  it("keeps only values that differ from the profile and lets profile changes flow to the rest", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "ovr-device-01", nickname: "Sala" });
    const profile = await createProfile(db, actor, { name: "P", platform: "tv" });
    await setDeviceProfile(db, actor, id, profile.id);

    const stored = await setDeviceOverrides(db, actor, id, { clock24h: false, language: "pt-BR", channelInfoTimeoutSec: 8 });
    expect(stored).toBe(1); // only clock24h differs from the profile defaults
    expect((await deviceConfig(db, id)).settings.clock24h).toBe(false);

    await updateProfileSettings(db, actor, profile.id, { language: "es" });
    const cfg = await deviceConfig(db, id);
    expect(cfg.settings.language).toBe("es");
    expect(cfg.settings.clock24h).toBe(false);

    await clearDeviceOverrides(db, actor, id);
    expect((await deviceConfig(db, id)).settings.clock24h).toBe(true);
  });
});

describe("snapshots and device copy", () => {
  async function setup() {
    const src = await addDevice(db, actor, { deviceId: "snap-source-1", nickname: "Origem" });
    const dst = await addDevice(db, actor, { deviceId: "snap-target-1", nickname: "Destino" });
    const profile = await createProfile(db, actor, { name: "P", platform: "tv" });
    const pl = await createPlaylist(db, actor, { name: "Lista", type: "m3u", url: "https://exemplo.com/l.m3u" });
    await setDeviceProfile(db, actor, src.id, profile.id);
    await setDevicePlaylists(db, actor, src.id, [pl.id]);
    await setDeviceOverrides(db, actor, src.id, { autoFrameRate: true });
    return { src: src.id, dst: dst.id, profile, pl };
  }

  it("saves a snapshot and restores it on another device", async () => {
    const { src, dst, profile, pl } = await setup();
    const snap = await createSnapshot(db, actor, src, "Config loja");
    expect((await listSnapshots(db))[0].sourceNickname).toBe("Origem");

    const before = (await deviceConfig(db, dst)).version;
    await restoreSnapshot(db, actor, snap.id, dst);
    const d = await getDevice(db, dst);
    expect(d.profileId).toBe(profile.id);
    expect(d.playlists.map((p) => p.id)).toEqual([pl.id]);
    const cfg = await deviceConfig(db, dst);
    expect(cfg.settings.autoFrameRate).toBe(true);
    expect(cfg.version).toBeGreaterThan(before);
  });

  it("copies directly between devices and skips playlists deleted since", async () => {
    const { src, dst, pl } = await setup();
    const snap = await createSnapshot(db, actor, src, "Antes");
    await deletePlaylist(db, actor, pl.id);
    await restoreSnapshot(db, actor, snap.id, dst);
    expect((await getDevice(db, dst)).playlists).toHaveLength(0);

    await copyDevice(db, actor, src, dst);
    expect((await getDevice(db, dst)).settingsOverrides).toEqual({ autoFrameRate: true });
    await expect(copyDevice(db, actor, src, src)).rejects.toThrow(/diferente/);
  });
});
