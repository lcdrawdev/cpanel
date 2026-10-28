import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { activateDevice, activateSchema } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";

/** POST { deviceId, code?, platform, appVersion?, model? } → { token, config } */
export async function POST(request: Request) {
  try {
    const input = activateSchema.parse(await request.json());
    const result = await activateDevice(await getDb(), input);
    return NextResponse.json(result, { status: 200, headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
