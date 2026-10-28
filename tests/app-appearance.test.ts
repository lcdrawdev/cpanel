import { describe, expect, it } from "vitest";
import { createDatabase } from "@/server/db/create";

const testDb = () => createDatabase({ pgliteDir: "memory://" });
import { addDevice } from "@/server/services/devices";
import { deviceConfig } from "@/server/services/device-api";
import { updateAppearance } from "@/server/services/app-appearance";
import { createMessage, deleteMessage, listMessages } from "@/server/services/messages";

const base = { appName: "SFL miTV", homeShowFavorites: true, homeShowSport: false, homeShowTrending: true, tmdbLanguage: "pt-BR" as const, sportsGroupKeywords: ["esporte", "Premiere"], removeLogo: false, tmdbKey: "", removeTmdbKey: false };

describe("app appearance and messages", () => {
  it("sends name, logo path and home sections to devices", async () => {
    const db = await testDb();
    const d = await addDevice(db, "t", { deviceId: "tv-aparencia-1", nickname: "Sala" });
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });
    await updateAppearance(db, "t", { ...base, logo: png });
    const cfg = await deviceConfig(db, d.id);
    expect(cfg.account.branding.appName).toBe("SFL miTV");
    expect(cfg.account.branding.logoPath).toMatch(/^\/api\/v1\/branding\/logo\?v=/);
    // No TMDB key yet: the trending row stays off even when switched on.
    expect(cfg.account.branding.home).toEqual({ favorites: true, sport: false, trending: false });
    expect(cfg.account.sports.groupKeywords).toEqual(["ESPORTE", "PREMIERE"]);
  });

  it("rejects logos that are not images", async () => {
    const db = await testDb();
    const txt = new File(["oi"], "logo.txt", { type: "text/plain" });
    await expect(updateAppearance(db, "t", { ...base, logo: txt })).rejects.toThrow(/PNG, JPG ou WebP/);
  });

  it("delivers messages to everyone or to one device", async () => {
    const db = await testDb();
    const a = await addDevice(db, "t", { deviceId: "tv-avisos-a", nickname: "A" });
    const b = await addDevice(db, "t", { deviceId: "tv-avisos-b", nickname: "B" });
    await createMessage(db, "t", { title: "Geral", body: "Para todos", target: "all", groupId: null, deviceId: null, days: 7 });
    await createMessage(db, "t", { title: "Só A", body: "Particular", target: "device", groupId: null, deviceId: a.id, days: 0 });
    expect((await deviceConfig(db, a.id)).messages.map((m) => m.title).sort()).toEqual(["Geral", "Só A"]);
    expect((await deviceConfig(db, b.id)).messages.map((m) => m.title)).toEqual(["Geral"]);
    const geral = (await listMessages(db)).find((m) => m.title === "Geral")!;
    await deleteMessage(db, "t", geral.id);
    expect((await deviceConfig(db, b.id)).messages).toEqual([]);
  });
});
