import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateApiKey } from "@/server/services/integrations";
import { listDevices } from "@/server/services/devices";
import { apiError, noStore } from "@/server/http/device-route";

/** GET with `Authorization: Bearer pak_…` → read-only device inventory for integrations. */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    await authenticateApiKey(db, request.headers.get("authorization"));
    const devices = await listDevices(db, new URL(request.url).searchParams.get("q") ?? undefined);
    return NextResponse.json(
      { devices: devices.map(({ id, deviceId, nickname, platform, status, appVersion, lastSeenAt, profileName, online }) => ({ id, deviceId, nickname, platform, status, appVersion, lastSeenAt, profile: profileName, online })) },
      { headers: noStore },
    );
  } catch (e) {
    return apiError(e);
  }
}
