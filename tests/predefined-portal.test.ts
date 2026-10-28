import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice } from "@/server/services/devices";
import { activateDevice, deviceConfig } from "@/server/services/device-api";
import { addPredefinedPortal, listPredefinedPortals, setPortalMode, updateBranding } from "@/server/services/predefined-portal";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("pre-defined portal", () => {
  it("is off by default and needs a portal of the chosen type", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "pp-device-01", nickname: "Sala" });
    await activateDevice(db, { deviceId: "pp-device-01", platform: "android_tv" });
    expect((await deviceConfig(db, id)).account.predefinedPortal).toBeNull();
    await expect(setPortalMode(db, actor, "xtream")).rejects.toThrow(/pelo menos um portal XC/);
  });

  it("delivers only portals of the active type plus branding", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "pp-device-01", nickname: "Sala" });
    const { config } = await activateDevice(db, { deviceId: "pp-device-01", platform: "android_tv" });
    await addPredefinedPortal(db, actor, { type: "xtream", name: "Principal", url: "http://portal.exemplo.test:8080" });
    await addPredefinedPortal(db, actor, { type: "stalker", name: "MAG", url: "http://mag.exemplo.test/c/" });
    await setPortalMode(db, actor, "xtream");
    await updateBranding(db, actor, { logoUrl: "https://exemplo.test/logo.png", homeLine: "Bem-vindo", userAgent: "PainelApp/1.0", activationCodeHint: "" });

    const after = await deviceConfig(db, id);
    expect(after.version).toBeGreaterThan(config.version);
    expect(after.account.predefinedPortal).toMatchObject({ type: "xtream", homeLine: "Bem-vindo", userAgent: "PainelApp/1.0" });
    expect(after.account.predefinedPortal?.portals.map((p) => p.name)).toEqual(["Principal"]);
  });

  it("rejects credentials in the portal URL and non-http logos", async () => {
    await expect(addPredefinedPortal(db, actor, { type: "xtream", name: "X", url: "http://u:p@portal.test" })).rejects.toThrow(/usuário ou senha/);
    await expect(updateBranding(db, actor, { logoUrl: "javascript:alert(1)", homeLine: "", userAgent: "", activationCodeHint: "" })).rejects.toThrow(/URL http/);
    expect(await listPredefinedPortals(db)).toHaveLength(0);
  });
});
