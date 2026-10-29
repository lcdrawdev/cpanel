import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";import { assistantFeed } from "@/server/services/assistant";

/** GET → `{ cards, profile, refreshInSec }`: game reminders, new episodes and suggestions, most important first. */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    return NextResponse.json(await assistantFeed(db, device), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}