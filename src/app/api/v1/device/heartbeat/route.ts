import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice, configVersion, heartbeat, heartbeatSchema } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";

/** POST { appVersion?, model? } → { version } so the app knows whether to refetch the config. */
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    const body = request.headers.get("content-length") === "0" ? {} : await request.json().catch(() => ({}));
    await heartbeat(db, device.id, heartbeatSchema.parse(body));
    return NextResponse.json({ version: await configVersion(db, device) }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
