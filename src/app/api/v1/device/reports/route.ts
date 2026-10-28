import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { reportChannel, reportSchema } from "@/server/services/reports";
import { apiError, noStore } from "@/server/http/device-route";

/** POST { channelName, reason, channelId?, playlistId? } → { alreadyReported, message? } */
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    const result = await reportChannel(db, device.id, reportSchema.parse(await request.json()));
    return NextResponse.json(result, { status: result.alreadyReported ? 200 : 201, headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
