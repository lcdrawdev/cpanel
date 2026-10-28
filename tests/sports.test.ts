import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice } from "@/server/services/devices";
import { activateDevice, deviceConfig } from "@/server/services/device-api";
import { hideSportEntry, unhideSportEntry, updateSportsMode } from "@/server/services/sports";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("sports visibility", () => {
  it("sends hidden sports and entries to devices", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "sport-device-1", nickname: "Sala" });
    const { config } = await activateDevice(db, { deviceId: "sport-device-1", platform: "android_tv" });
    expect(config.account.sports).toMatchObject({ enabled: true, hiddenSports: [], hiddenEntries: [] });
    expect(config.account.sports.groupKeywords).toContain("JOGOS DO DIA");

    await updateSportsMode(db, actor, { enabled: true, hiddenSports: ["golf", "cricket", "golf"] });
    expect(await hideSportEntry(db, actor, { sport: "football", kind: "league", name: "Liga Exemplo" })).toBe(true);
    expect(await hideSportEntry(db, actor, { sport: "football", kind: "league", name: "liga exemplo" })).toBe(false);

    const after = await deviceConfig(db, id);
    expect(after.version).toBeGreaterThan(config.version);
    expect(after.account.sports.hiddenSports).toEqual(["golf", "cricket"]);
    expect(after.account.sports.hiddenEntries).toHaveLength(1);

    await unhideSportEntry(db, actor, 0);
    expect((await deviceConfig(db, id)).account.sports.hiddenEntries).toHaveLength(0);
  });

  it("rejects unknown sports", async () => {
    await expect(updateSportsMode(db, actor, { enabled: true, hiddenSports: ["quidditch"] })).rejects.toThrow(/desconhecido/);
  });
});
