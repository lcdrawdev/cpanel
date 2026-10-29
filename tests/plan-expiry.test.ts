import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice, setDevicePlan } from "@/server/services/devices";
import { deviceConfig } from "@/server/services/device-api";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("plan due date", () => {
  it("sends the due date (end of the day in Brasília) and the notice days to the TV", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "plan-device-01", nickname: "TV 1" });
    const before = await deviceConfig(db, id);
    expect(before.device.planExpiresAt).toBeNull();
    expect(before.device.expiryNoticeDays).toBe(5);

    await setDevicePlan(db, actor, id, "2026-11-03", 3);
    const after = await deviceConfig(db, id);
    expect(after.device.planExpiresAt).toBe("2026-11-04T02:59:59.000Z");
    expect(after.device.expiryNoticeDays).toBe(3);
    expect(after.version).toBeGreaterThan(before.version);

    await setDevicePlan(db, actor, id, "", 2);
    expect((await deviceConfig(db, id)).device.planExpiresAt).toBeNull();
  });

  it("only accepts 5, 3 or 2 days and a real date", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "plan-device-02", nickname: "TV 2" });
    await expect(setDevicePlan(db, actor, id, "2026-11-03", 7)).rejects.toThrow("5, 3 ou 2");
    await expect(setDevicePlan(db, actor, id, "03/11/2026", 5)).rejects.toThrow("inválida");
    await expect(setDevicePlan(db, actor, id, "2026-13-40", 5)).rejects.toThrow("inválida");
  });
});
