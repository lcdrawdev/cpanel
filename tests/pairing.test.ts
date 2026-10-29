import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { activateDevice } from "@/server/services/device-api";
import { confirmPairing, macFor, normalizeMac, startPairing } from "@/server/services/pairing";

let db: Database;
const tv = { deviceId: "a1b2c3d4e5f60718", platform: "android_tv" as const };

beforeEach(async () => {
  process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("first access by the TV (Ativação do Dispositivo)", () => {
  it("gives a stable MAC-style id and a 6-digit code", async () => {
    const r = await startPairing(db, tv, "http://painel/ativar");
    expect(r).toMatchObject({ status: "waiting", mac: macFor(tv.deviceId), url: "http://painel/ativar" });
    expect(r.code).toMatch(/^\d{6}$/);
    expect(normalizeMac(r.mac.replace(/:/g, "").toLowerCase())).toBe(r.mac);
  });

  it("only lets the TV in after the code is confirmed on /ativar", async () => {
    const r = await startPairing(db, tv, "u");
    await expect(activateDevice(db, { ...tv, code: undefined })).rejects.toMatchObject({ code: "awaiting_activation" });
    await expect(confirmPairing(db, r.mac, "000000" === r.code ? "111111" : "000000", "ip1")).rejects.toMatchObject({ code: "invalid_code" });
    await confirmPairing(db, r.mac.toLowerCase().replace(/:/g, "-"), r.code!, "ip1");
    const a = await activateDevice(db, { ...tv, code: undefined });
    expect(a.token.length).toBeGreaterThan(20);
    expect(await startPairing(db, tv, "u")).toMatchObject({ status: "active" });
  });

  it("locks the code after 5 wrong tries and limits tries per address", async () => {
    const r = await startPairing(db, tv, "u");
    const bad = r.code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await expect(confirmPairing(db, r.mac, bad, `ip-${i}`)).rejects.toMatchObject({ code: "invalid_code" });
    await expect(confirmPairing(db, r.mac, r.code!, "ip-x")).rejects.toMatchObject({ code: "locked" });
    for (let i = 0; i < 10; i++) await confirmPairing(db, "00:00:00:00:00:00", "123456", "flood").catch(() => {});
    await expect(confirmPairing(db, r.mac, r.code!, "flood")).rejects.toMatchObject({ code: "rate_limited" });
  });
});
