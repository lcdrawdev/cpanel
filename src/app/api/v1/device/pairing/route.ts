import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { pairingSchema, startPairing } from "@/server/services/pairing";
import { apiError, noStore } from "@/server/http/device-route";

/**
 * POST `{ deviceId, platform, appVersion?, model? }` (no token: first access) →
 * `{ status: "waiting", mac, code, expiresInSec, url }`, or `{ status: "active" | "registered", mac }`.
 * The activation page is PUBLIC_ACTIVATION_URL when set, else this panel's own /ativar.
 */
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const input = pairingSchema.parse(await request.json());
    // The address the TV used to reach the panel (Host header), so the phone can open the same page.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    const url = process.env.PUBLIC_ACTIVATION_URL || `${proto}://${host}/ativar`;
    return NextResponse.json(await startPairing(db, input, url), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}