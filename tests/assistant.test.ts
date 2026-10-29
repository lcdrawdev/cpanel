import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { devices } from "@/server/db/schema";
import { applyEvents, ask, assistantFeed, genreKeys, getProfile, markCard, recordEvents, updateProfile } from "@/server/services/assistant";

let db: Database;
let device: { id: string };
const calls: string[] = [];
const soon = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 19);

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
  [device] = await db.insert(devices).values({ deviceId: "abc", nickname: "Sala", status: "active" }).returning({ id: devices.id });
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("searchteams")) return Response.json({ teams: [{ idTeam: "134287", strTeam: "Flamengo", strBadge: "https://img/fla.png", strSport: "Soccer", strLeague: "Brazilian Serie A" }] });
    if (url.includes("eventsnext")) return Response.json({ events: [{ idEvent: "99", strTimestamp: soon, strHomeTeam: "Vasco da Gama", strAwayTeam: "Flamengo", strLeague: "Brazilian Serie A", strAwayTeamBadge: "https://img/fla.png" }] });
    return Response.json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("assistant taste profile", () => {
  it("splits list genres into TMDB-style keys", () => {
    expect(genreKeys(["Ação, Suspense", "Drama / Comédia"])).toEqual(["acao", "thriller", "drama", "comedia"]);
  });

  it("adds minutes per genre and halves old weight after 30 days", () => {
    const start = { genres: { drama: 100 }, kinds: {}, hours: {}, finished: [], series: [], decayedAt: new Date("2026-09-29T00:00:00Z") };
    const p = applyEvents(start, [{ kind: "movie", title: "Ponto Sem Retorno (2026)", genres: ["Ação"], minutes: 90, finished: true, hour: 21 }], new Date("2026-10-29T00:00:00Z"));
    expect(p.genres).toEqual({ drama: 50, acao: 90 });
    expect(p.hours).toEqual({ noite: 90 });
    expect(p.finished[0]).toMatchObject({ title: "Ponto Sem Retorno (2026)", kind: "movie" });
  });

  it("follows a series after two finished episodes", async () => {
    const ep = { kind: "series" as const, title: "Lupin", genres: ["Crime"], minutes: 45, finished: true, seriesId: "8812", playlistId: "p1", episodes: 17 };
    await recordEvents(db, device, { events: [ep] });
    expect((await getProfile(db, device)).series[0]).toMatchObject({ following: false, watched: 1, knownEpisodes: 17 });
    await recordEvents(db, device, { events: [ep] });
    expect((await getProfile(db, device)).series[0]).toMatchObject({ following: true, watched: 2 });
  });
});

describe("assistant feed", () => {
  it("reminds the favourite team's game and shares one lookup across TVs", async () => {
    await updateProfile(db, device, { teams: [{ id: "134287", name: "Flamengo", badge: null, sport: "Soccer" }] });
    const [other] = await db.insert(devices).values({ deviceId: "def", nickname: "Quarto", status: "active" }).returning({ id: devices.id });
    await updateProfile(db, other, { teams: [{ id: "134287", name: "Flamengo", badge: null, sport: "Soccer" }] });
    const feed = await assistantFeed(db, device);
    await assistantFeed(db, other);
    expect(feed.cards[0]).toMatchObject({ id: "m-99", type: "match", priority: 90, title: "Vasco da Gama x Flamengo" });
    expect(calls.filter((c) => c.includes("eventsnext"))).toHaveLength(1);
  });

  it("hides a card the TV dismissed", async () => {
    await updateProfile(db, device, { teams: [{ id: "134287", name: "Flamengo", badge: null, sport: "Soccer" }] });
    await markCard(db, device, "m-99", { status: "dismissed" });
    expect((await assistantFeed(db, device)).cards).toHaveLength(0);
  });
});

describe("assistant voice", () => {
  it("saves the favourite team from a sentence", async () => {
    const r = await ask(db, device, { text: "Meu time é o Flamengo" });
    expect(r.intent).toBe("team");
    expect(r.answer).toContain("Flamengo é o seu time");
    expect((await getProfile(db, device)).teams[0]).toMatchObject({ id: "134287", name: "Flamengo" });
  });

  it("answers the next game and hands unknown phrases to search", async () => {
    expect((await ask(db, device, { text: "Quando joga o Flamengo?" })).answer).toContain("Vasco da Gama x Flamengo");
    expect(await ask(db, device, { text: "Big Brother" })).toMatchObject({ intent: "search", action: { kind: "search", query: "Big Brother" } });
  });
});
