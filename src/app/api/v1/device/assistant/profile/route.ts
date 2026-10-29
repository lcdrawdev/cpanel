import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";import { getProfile, profileView, updateProfile } from "@/server/services/assistant";

/** GET → the viewer's teams, followed series and strongest genres. PUT `{ teams?, series? }` → saves them. */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    return NextResponse.json(profileView(await getProfile(db, device)), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    return NextResponse.json(await updateProfile(db, device, await request.json()), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}