import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice, getDevice, setDevicePlaylists } from "@/server/services/devices";
import { connectDeviceXtream, createPlaylist, playlistsForDevice } from "@/server/services/playlists";

let db: Database;
const actor = "teste@exemplo.com";
const server = "http://portal.exemplo:8080/";

// Fake XC server: accepts only usuario/certa.
function stubXtream() {
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    const ok = input.searchParams.get("username") === "usuario" && input.searchParams.get("password") === "certa";
    return Response.json({ user_info: { auth: ok ? 1 : 0, status: "Active" } });
  }));
}

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
  stubXtream();
});
afterEach(() => vi.unstubAllGlobals());

describe("device XC login (Conectar)", () => {
  it("rejects a login the server refuses", async () => {
    const d = await addDevice(db, actor, { deviceId: "tv-000001", nickname: "Sala" });
    await expect(connectDeviceXtream(db, actor, d.id, { url: server, username: "usuario", password: "errada" })).rejects.toThrow(/recusou/);
    expect((await getDevice(db, d.id)).playlists).toHaveLength(0);
  });

  it("delivers the login to this TV and bumps its config", async () => {
    const d = await addDevice(db, actor, { deviceId: "tv-000001", nickname: "Sala" });
    const before = (await getDevice(db, d.id)).configVersion;
    await connectDeviceXtream(db, actor, d.id, { url: server, username: "usuario", password: "certa" });
    const after = await getDevice(db, d.id);
    expect(after.configVersion).toBeGreaterThan(before);
    expect(await playlistsForDevice(db, d.id)).toMatchObject([{ type: "xtream", url: server, username: "usuario", password: "certa" }]);
  });

  it("does not change a playlist shared with other TVs", async () => {
    const a = await addDevice(db, actor, { deviceId: "tv-000001", nickname: "Sala" });
    const b = await addDevice(db, actor, { deviceId: "tv-000002", nickname: "Quarto" });
    const shared = await createPlaylist(db, actor, { name: "Geral", type: "xtream", url: server, username: "outro", password: "x" });
    await setDevicePlaylists(db, actor, a.id, [shared.id]);
    await setDevicePlaylists(db, actor, b.id, [shared.id]);

    await connectDeviceXtream(db, actor, a.id, { url: server, username: "usuario", password: "certa" });
    expect((await playlistsForDevice(db, a.id)).map((p) => p.username)).toEqual(["usuario"]);
    expect((await playlistsForDevice(db, b.id)).map((p) => p.username)).toEqual(["outro"]);

    // Connecting again reuses this TV's own playlist instead of creating another.
    await connectDeviceXtream(db, actor, a.id, { url: server, username: "usuario", password: "certa" });
    expect(await playlistsForDevice(db, a.id)).toHaveLength(1);
  });
});
