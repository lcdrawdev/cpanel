import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";import { recordEvents } from "@/server/services/assistant";

/** POST `{ events: [{ kind, title, genres, minutes, finished, … }] }` → adds a batch of watching to the taste profile. */
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    return NextResponse.json(await recordEvents(db, device, await request.json()), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}