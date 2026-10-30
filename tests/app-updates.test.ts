import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { importUpdate, publishUpdate, listUpdates, publishedUpdateFor, updateFileFor } from "@/server/services/app-updates";
import { addDevice } from "@/server/services/devices";
import { heartbeat, deviceConfig } from "@/server/services/device-api";
import { eq } from "drizzle-orm";
import { devices } from "@/server/db/schema";

let db: Database;
const actor = "teste@exemplo.com";
const base64 = Buffer.from("fake-apk-bytes").toString("base64");

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

async function importV(version: string, code: number) {
  await importUpdate(db, actor, { platform: "android_tv", version, versionCode: code, notes: "Correções", mandatory: false, fileName: "app.apk", fileSize: 14, base64 });
}

describe("app updates", () => {
  it("imports as draft, then publish turns it on for the platform", async () => {
    await importV("0.18.9", 52);
    expect(await publishedUpdateFor(db, "android_tv")).toBeNull(); // draft is not offered

    await publishUpdate(db, actor, "android_tv", true);
    const pub = await publishedUpdateFor(db, "android_tv");
    expect(pub).toMatchObject({ version: "0.18.9", versionCode: 52, mandatory: false });

    // Another platform is unaffected.
    expect(await publishedUpdateFor(db, "tizen")).toBeNull();

    await publishUpdate(db, actor, "android_tv", false);
    expect(await publishedUpdateFor(db, "android_tv")).toBeNull();
  });

  it("re-importing replaces the file and resets to draft", async () => {
    await importV("0.18.8", 51);
    await publishUpdate(db, actor, "android_tv", true);
    await importV("0.19.0", 53); // new import
    expect(await publishedUpdateFor(db, "android_tv")).toBeNull(); // back to draft
    expect((await listUpdates(db)).find((r) => r.platform === "android_tv")?.version).toBe("0.19.0");
  });

  it("serves the file only once published and surfaces it in the device config", async () => {
    await importV("0.18.9", 52);
    expect(await updateFileFor(db, "android_tv")).toBeNull();
    await publishUpdate(db, actor, "android_tv", true);
    expect((await updateFileFor(db, "android_tv"))?.buffer.toString()).toBe("fake-apk-bytes");

    const dev = await addDevice(db, actor, { deviceId: "tv-update-01", nickname: "TV" });
    await db.update(devices).set({ platform: "android_tv", status: "active" }).where(eq(devices.id, dev.id));
    await heartbeat(db, dev.id, {});
    const cfg = await deviceConfig(db, dev.id);
    expect(cfg.update).toMatchObject({ version: "0.18.9", versionCode: 52 });
  });
});
