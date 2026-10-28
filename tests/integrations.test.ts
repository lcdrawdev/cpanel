import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice, removeDevice } from "@/server/services/devices";
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "@/server/services/integrations";
import { recentNotifications, updateNotificationPrefs } from "@/server/services/notifications";
import { reportChannel } from "@/server/services/reports";
import { apiKeys } from "@/server/db/schema";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("API keys", () => {
  it("shows the key once, stores only its hash and can be revoked", async () => {
    const { id, key } = await createApiKey(db, actor, "Financeiro");
    expect(key.startsWith("pak_")).toBe(true);
    const [raw] = await db.select().from(apiKeys);
    expect(raw.keyHash).not.toContain(key);
    expect((await authenticateApiKey(db, `Bearer ${key}`)).id).toBe(id);
    expect((await listApiKeys(db))[0].lastUsedAt).not.toBeNull();
    await revokeApiKey(db, actor, id);
    await expect(authenticateApiKey(db, `Bearer ${key}`)).rejects.toThrow(/revogada/);
  });
});

describe("notifications outbox", () => {
  it("queues alerts only when an address is set and the type is on", async () => {
    await addDevice(db, actor, { deviceId: "ntf-device-01", nickname: "Sem e-mail" });
    expect(await recentNotifications(db)).toHaveLength(0);

    await updateNotificationPrefs(db, actor, { email: "alertas@exemplo.test", deviceAdded: true, deviceRemoved: false, channelReport: true });
    const { id } = await addDevice(db, actor, { deviceId: "ntf-device-02", nickname: "Sala" });
    await reportChannel(db, id, { channelName: "Canal 1", reason: "Sem som" });
    await removeDevice(db, actor, id);
    const kinds = (await recentNotifications(db)).map((n) => n.kind).sort();
    expect(kinds).toEqual(["channel_report", "device_added"]);
    await expect(updateNotificationPrefs(db, actor, { email: "nao-e-email", deviceAdded: true, deviceRemoved: true, channelReport: true })).rejects.toThrow(/inválido/);
  });
});
