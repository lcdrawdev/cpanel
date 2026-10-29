import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { activateDevice, activateSchema } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";
import { clientIp, rateLimit } from "@/server/rate-limit";

/** POST { deviceId, code?, platform, appVersion?, model? } → { token, config } */
export async function POST(request: Request) {
  try {
    const input = activateSchema.parse(await request.json());
    // Guessing activation codes: 20 tries with a code per address a minute (TVs waiting for /ativar send none).
    if (input.code) rateLimit(`activate:${clientIp(request.headers)}`, 20, 60_000);
    const result = await activateDevice(await getDb(), input);
    return NextResponse.json(result, { status: 200, headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
