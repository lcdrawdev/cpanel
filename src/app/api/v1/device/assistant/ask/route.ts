import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";import { ask } from "@/server/services/assistant";

/** POST `{ text, timeZone? }` → a spoken request already turned into text; answers with a sentence plus cards or an action. */
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    return NextResponse.json(await ask(db, device, await request.json()), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}