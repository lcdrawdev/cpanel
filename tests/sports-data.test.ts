import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { liveMatches, sameTeam, standings, teamKey, updateSportsDataKeys } from "@/server/services/sports-data";

let db: Database;

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("lookupleague")) return Response.json({ leagues: [{ strCurrentSeason: "2026", strBadge: "https://img/league.png" }] });
    if (url.includes("lookuptable")) {
      return Response.json({ table: [{ intRank: "1", strTeam: "Flamengo", strBadge: "https://img/fla.png", intPlayed: "32", intWin: "21", intDraw: "7", intLoss: "4", intGoalsFor: "64", intGoalsAgainst: "27", intGoalDifference: "37", intPoints: "70", strForm: "WWWDW", strDescription: "Libertadores" }] });
    }
    return Response.json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("sports data", () => {
  it("reduces list team names to what the provider searches", () => {
    expect(teamKey("Club América")).toBe("america");
    expect(teamKey("São Paulo FC")).toBe("sao paulo");
  });

  it("reads the current season and maps the standings", async () => {
    const t = await standings(db, "4351");
    expect(t).toMatchObject({ name: "Brasileirão Série A", season: "2026", partial: true });
    expect(t.rows[0]).toMatchObject({ rank: 1, team: "Flamengo", points: 70, goalDiff: 37 });
  });

  it("matches the list's games to today's fixtures, in either order and with shortened names", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      expect(String(input)).toContain("api-sports.io/fixtures?date=");
      return Response.json({
        errors: [],
        response: [
          { fixture: { timestamp: 1793210400, status: { short: "2H", elapsed: 67 } }, league: { name: "Serie A", logo: "L" }, teams: { home: { name: "AC Milan", logo: "M" }, away: { name: "Bologna", logo: "B" } }, goals: { home: 2, away: 1 } },
          { fixture: { timestamp: 1793199600, status: { short: "FT", elapsed: 90 } }, league: { name: "Liga MX", logo: null }, teams: { home: { name: "Club America", logo: "A" }, away: { name: "Club Tijuana", logo: "T" } }, goals: { home: 0, away: 0 } },
        ],
      });
    }));
    await updateSportsDataKeys(db, "a@b.c", { sportsDbKey: "", removeSportsDbKey: false, apiSportsKey: "chave-teste", removeApiSportsKey: false });
    const { matches, enabled } = await liveMatches(db, ["AC Milan~Bologna", "Tijuana~América", "Time X~Time Y"]);
    expect(enabled).toBe(true);
    expect(matches["AC Milan~Bologna"]).toMatchObject({ state: "live", elapsed: 67, goalsHome: 2, goalsAway: 1, homeLogo: "M" });
    expect(matches["Tijuana~América"]).toMatchObject({ state: "ended", home: "Club America", swapped: true });
    expect(matches["Time X~Time Y"]).toBeNull();
  });

  it("compares team names loosely but not too loosely", () => {
    expect(sameTeam("Inter", "Inter Milan")).toBe(true);
    expect(sameTeam("Manchester City", "Manchester United")).toBe(false);
    expect(sameTeam("Atlético-MG", "Atletico Mineiro")).toBe(false);
  });

  it("rejects a TheSportsDB key the provider refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ leagues: null })));
    await expect(updateSportsDataKeys(db, "a@b.c", { sportsDbKey: "errada", removeSportsDbKey: false, apiSportsKey: "", removeApiSportsKey: false })).rejects.toThrow(/não aceitou/);
  });
});
