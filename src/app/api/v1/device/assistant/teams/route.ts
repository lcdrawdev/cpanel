import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";import { searchTeams } from "@/server/services/assistant";

/** GET `?q=flamengo` → teams to pick as favourite (TheSportsDB, cached for a week). */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    await authenticateDevice(db, request.headers.get("authorization"));
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ teams: await searchTeams(db, q.slice(0, 60)) }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}