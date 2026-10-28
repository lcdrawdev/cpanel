import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice, getDevice } from "@/server/services/devices";
import { createPlaylist, deletePlaylist } from "@/server/services/playlists";
import { createProfile } from "@/server/services/profiles";
import { createCode } from "@/server/services/codes";
import { activateDevice, deviceConfig } from "@/server/services/device-api";
import { createGroup, deleteGroup, getGroup, listGroups, setDeviceGroup, updateGroup } from "@/server/services/groups";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

async function fixtures() {
  const profile = await createProfile(db, actor, { name: "Perfil TV", platform: "tv" });
  const pl = await createPlaylist(db, actor, { name: "Lista", type: "m3u", url: "https://exemplo.com/lista.m3u" });
  return { profile, pl };
}

describe("device groups", () => {
  it("applies the group profile and playlists when a device joins", async () => {
    const { profile, pl } = await fixtures();
    const group = await createGroup(db, actor, { name: "Loja", profileId: profile.id, playlistIds: [pl.id] });
    const { id } = await addDevice(db, actor, { deviceId: "grp-device-01", nickname: "TV 1" });
    const before = (await deviceConfig(db, id)).version;

    await setDeviceGroup(db, actor, id, group.id);
    const device = await getDevice(db, id);
    expect(device.group?.name).toBe("Loja");
    expect(device.profileId).toBe(profile.id);
    expect(device.playlists.map((p) => p.id)).toEqual([pl.id]);
    expect((await deviceConfig(db, id)).version).toBeGreaterThan(before);
    expect((await listGroups(db))[0].deviceCount).toBe(1);
  });

  it("re-applies to every member when the group is saved", async () => {
    const { profile, pl } = await fixtures();
    const group = await createGroup(db, actor, { name: "Loja", profileId: null, playlistIds: [] });
    const a = await addDevice(db, actor, { deviceId: "grp-device-01", nickname: "A" });
    const b = await addDevice(db, actor, { deviceId: "grp-device-02", nickname: "B" });
    await setDeviceGroup(db, actor, a.id, group.id);
    await setDeviceGroup(db, actor, b.id, group.id);

    await updateGroup(db, actor, group.id, { name: "Loja centro", profileId: profile.id, playlistIds: [pl.id] });
    for (const id of [a.id, b.id]) {
      const d = await getDevice(db, id);
      expect(d.profileId).toBe(profile.id);
      expect(d.playlists).toHaveLength(1);
    }
    expect((await getGroup(db, group.id)).members).toHaveLength(2);
  });

  it("puts devices activated with a group code into that group", async () => {
    const { profile, pl } = await fixtures();
    const group = await createGroup(db, actor, { name: "Revenda", profileId: profile.id, playlistIds: [pl.id] });
    const code = await createCode(db, actor, { label: "Revenda", maxUses: 3, profileId: null, playlistIds: [], groupId: group.id, expiresAt: null });
    const { config } = await activateDevice(db, { deviceId: "grp-device-09", code: code.code, platform: "android_tv" });
    expect(config.playlists).toHaveLength(1);
    expect((await getGroup(db, group.id)).members).toHaveLength(1);
  });

  it("keeps member configuration when the group is deleted and skips removed playlists", async () => {
    const { profile, pl } = await fixtures();
    const pl2 = await createPlaylist(db, actor, { name: "Outra", type: "m3u", url: "https://exemplo.com/2.m3u" });
    const group = await createGroup(db, actor, { name: "Loja", profileId: profile.id, playlistIds: [pl.id, pl2.id] });
    await deletePlaylist(db, actor, pl2.id);
    const { id } = await addDevice(db, actor, { deviceId: "grp-device-01", nickname: "A" });
    await setDeviceGroup(db, actor, id, group.id);
    expect((await getDevice(db, id)).playlists).toHaveLength(1);

    await deleteGroup(db, actor, group.id);
    const d = await getDevice(db, id);
    expect(d.groupId).toBeNull();
    expect(d.profileId).toBe(profile.id);
  });
});
