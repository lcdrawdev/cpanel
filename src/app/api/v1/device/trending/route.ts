import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { trending } from "@/server/services/app-appearance";
import { apiError, noStore } from "@/server/http/device-route";

/** GET with `Authorization: Bearer <token>` → titles trending this week on TMDB (movies, series, anime). */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    await authenticateDevice(db, request.headers.get("authorization"));
    return NextResponse.json({ items: await trending(db) }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
