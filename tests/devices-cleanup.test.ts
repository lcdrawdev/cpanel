import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice, disconnectedCount, listDevices, removeDisconnectedDevices } from "@/server/services/devices";
import { heartbeat } from "@/server/services/device-api";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("cleaning up disconnected devices", () => {
  it("keeps only the devices seen in the last few minutes", async () => {
    const online = await addDevice(db, actor, { deviceId: "online-01", nickname: "TV online" });
    await addDevice(db, actor, { deviceId: "offline-01", nickname: "TV desligada" });
    await addDevice(db, actor, { deviceId: "never-01", nickname: "TV nunca ligou" });
    // One device phoned home just now; the other two are disconnected (never, or long ago).
    await heartbeat(db, online.id, {});

    expect(await disconnectedCount(db)).toBe(2);
    const removed = await removeDisconnectedDevices(db, actor);
    expect(removed).toBe(2);

    const left = await listDevices(db);
    expect(left.map((d) => d.deviceId)).toEqual(["online-01"]);
    expect(await disconnectedCount(db)).toBe(0);
  });

  it("removes nothing when every device is online", async () => {
    const a = await addDevice(db, actor, { deviceId: "online-a-01", nickname: "A" });
    await heartbeat(db, a.id, {});
    expect(await removeDisconnectedDevices(db, actor)).toBe(0);
    expect((await listDevices(db)).length).toBe(1);
  });
});
