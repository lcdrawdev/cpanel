import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { STANDINGS_LEAGUES, liveMatches, standings, teamBadges } from "@/server/services/sports-data";
import { apiError, noStore } from "@/server/http/device-route";

/**
 * GET with `Authorization: Bearer <token>`:
 * - `?badges=Team A|Team B` → `{ badges: { "Team A": url | null }, pending }` (crests still loading come later)
 * - `?matches=Home~Away|Home~Away` → live football data (score, minute, status, crests) per match
 * - `?table=<leagueId>` → standings of that league
 * - nothing → `{ leagues }` offered under Classificação
 */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    await authenticateDevice(db, request.headers.get("authorization"));
    const q = new URL(request.url).searchParams;
    const badges = q.get("badges");
    if (badges != null) return NextResponse.json(await teamBadges(db, badges.split("|").map((s) => s.trim()).filter(Boolean)), { headers: noStore });
    const matches = q.get("matches");
    if (matches != null) return NextResponse.json(await liveMatches(db, matches.split("|").map((s) => s.trim()).filter(Boolean)), { headers: noStore });
    const table = q.get("table");
    if (table) return NextResponse.json(await standings(db, table), { headers: noStore });
    return NextResponse.json({ leagues: STANDINGS_LEAGUES }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
