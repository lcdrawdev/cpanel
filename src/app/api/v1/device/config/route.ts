import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice, configVersion, deviceConfig, heartbeat } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";

/**
 * GET with `Authorization: Bearer <token>` → current configuration.
 * Send `If-None-Match: "<version>"` to get 304 when nothing changed.
 */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    await heartbeat(db, device.id, {});
    const etag = `"${await configVersion(db, device)}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ...noStore, ETag: etag } });
    }
    return NextResponse.json(await deviceConfig(db, device.id), { headers: { ...noStore, ETag: etag } });
  } catch (e) {
    return apiError(e);
  }
}
