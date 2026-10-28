import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { adminForSession, changePassword, createFirstAdmin, login } from "@/server/services/admins";
import { addDevice, getDevice, setDeviceBlocked, setDevicePlaylists, setDeviceProfile } from "@/server/services/devices";
import { createCode, listCodes } from "@/server/services/codes";
import { createPlaylist, listPlaylists, updatePlaylist } from "@/server/services/playlists";
import { createProfile, updateProfileSettings } from "@/server/services/profiles";
import { activateDevice, authenticateDevice, deviceConfig } from "@/server/services/device-api";
import { playlists } from "@/server/db/schema";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("admin auth", () => {
  it("creates the first admin only once and logs in", async () => {
    await createFirstAdmin(db, { name: "Dono", email: "Dono@Exemplo.com", password: "senha-longa-123" });
    await expect(createFirstAdmin(db, { name: "Outro", email: "o@e.com", password: "senha-longa-123" })).rejects.toThrow(/já foi concluída/);
    await expect(login(db, "dono@exemplo.com", "errada-errada")).rejects.toThrow(/incorretos/);
    const { token } = await login(db, "dono@exemplo.com", "senha-longa-123");
    expect((await adminForSession(db, token))?.email).toBe("dono@exemplo.com");
  });

  it("revokes sessions when the password changes", async () => {
    const admin = await createFirstAdmin(db, { name: "Dono", email: "d@e.com", password: "senha-longa-123" });
    const { token } = await login(db, "d@e.com", "senha-longa-123");
    await changePassword(db, admin.id, "senha-longa-123", "nova-senha-456");
    expect(await adminForSession(db, token)).toBeNull();
  });
});

describe("playlists", () => {
  it("stores credentials encrypted and never lists them", async () => {
    await createPlaylist(db, actor, { name: "Principal", type: "xtream", url: "http://portal.exemplo:8080", username: "usuario-x", password: "segredo-y" });
    const [raw] = await db.select().from(playlists);
    expect(raw.usernameEnc).not.toContain("usuario-x");
    expect(raw.passwordEnc).not.toContain("segredo-y");
    const [listed] = await listPlaylists(db);
    expect(listed).not.toHaveProperty("passwordEnc");
    expect(listed.hasCredentials).toBe(true);
  });

  it("rejects credentials inside the URL", async () => {
    await expect(createPlaylist(db, actor, { name: "X", type: "m3u", url: "http://u:p@exemplo.com/lista.m3u" })).rejects.toThrow(/campos próprios/);
  });
});

describe("device activation and remote config", () => {
  it("activates a device registered by the admin and delivers its config", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "abc123def456", nickname: "Sala" });
    const result = await activateDevice(db, { deviceId: "abc123def456", platform: "android_tv" });
    expect(result.config.device.nickname).toBe("Sala");
    const device = await authenticateDevice(db, `Bearer ${result.token}`);
    expect(device.id).toBe(id);
  });

  it("refuses an unknown device without a code", async () => {
    await expect(activateDevice(db, { deviceId: "desconhecido01", platform: "other" })).rejects.toThrow(/não cadastrado/);
  });

  it("activates with a code, applies its profile and playlists, and enforces the use limit", async () => {
    const profile = await createProfile(db, actor, { name: "TV padrão", platform: "tv" });
    const pl = await createPlaylist(db, actor, { name: "Lista", type: "m3u", url: "https://exemplo.com/lista.m3u" });
    const code = await createCode(db, actor, { label: "Loja", maxUses: 1, profileId: profile.id, playlistIds: [pl.id], expiresAt: null });

    const first = await activateDevice(db, { deviceId: "tv-0000000001", code: code.code.toLowerCase(), platform: "android_tv" });
    expect(first.config.playlists).toHaveLength(1);
    expect(first.config.settings.lockPlaylistEditing).toBe(true);
    await expect(activateDevice(db, { deviceId: "tv-0000000002", code: code.code, platform: "android_tv" })).rejects.toThrow(/sem usos/);
    expect((await listCodes(db))[0].uses).toBe(1);
  });

  it("bumps the config version on every admin change", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "abc123def456", nickname: "Sala" });
    const { config } = await activateDevice(db, { deviceId: "abc123def456", platform: "android_tv" });
    const profile = await createProfile(db, actor, { name: "P", platform: "tv" });
    await setDeviceProfile(db, actor, id, profile.id);
    const afterProfile = (await deviceConfig(db, id)).version;
    expect(afterProfile).toBeGreaterThan(config.version);

    await updateProfileSettings(db, actor, profile.id, { clock24h: false });
    const afterSettings = await deviceConfig(db, id);
    expect(afterSettings.version).toBeGreaterThan(afterProfile);
    expect(afterSettings.settings.clock24h).toBe(false);

    const pl = await createPlaylist(db, actor, { name: "Lista", type: "xtream", url: "http://p.exemplo", username: "u", password: "s" });
    await setDevicePlaylists(db, actor, id, [pl.id]);
    const v = (await deviceConfig(db, id)).version;
    await updatePlaylist(db, actor, pl.id, { name: "Lista 2", type: "xtream", url: "http://p.exemplo" });
    const updated = await deviceConfig(db, id);
    expect(updated.version).toBeGreaterThan(v);
    expect(updated.playlists[0]).toMatchObject({ name: "Lista 2", username: "u", password: "s" });
  });

  it("revokes access when the device is blocked", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "abc123def456", nickname: "Sala" });
    const { token } = await activateDevice(db, { deviceId: "abc123def456", platform: "android_tv" });
    await setDeviceBlocked(db, actor, id, true);
    await expect(authenticateDevice(db, `Bearer ${token}`)).rejects.toThrow(/revogado/);
    await expect(activateDevice(db, { deviceId: "abc123def456", platform: "android_tv" })).rejects.toThrow(/bloqueado/);
    expect((await getDevice(db, id)).status).toBe("blocked");
  });
});
