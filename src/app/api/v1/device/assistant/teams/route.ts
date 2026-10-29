import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";import { searchTeams, TEAM_COUNTRIES, teamsByCountry } from "@/server/services/assistant";

/**
 * Teams to pick as favourite (TheSportsDB, cached for a week):
 * - nothing → `{ countries }` · `?country=Brazil` → that country's clubs · `?q=flamengo` → search by name
 */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    await authenticateDevice(db, request.headers.get("authorization"));
    const params = new URL(request.url).searchParams;
    const country = params.get("country");
    if (country) return NextResponse.json({ teams: teamsByCountry(country) }, { headers: noStore });
    const q = params.get("q");
    if (q == null) return NextResponse.json({ countries: TEAM_COUNTRIES.map(({ id, name }) => ({ id, name })) }, { headers: noStore });
    return NextResponse.json({ teams: await searchTeams(db, q.slice(0, 60)) }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}