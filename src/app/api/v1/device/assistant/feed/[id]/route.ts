import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateDevice } from "@/server/services/device-api";
import { apiError, noStore } from "@/server/http/device-route";import { markCard } from "@/server/services/assistant";

/** POST `{ status: "seen" | "dismissed" | "done" | "snoozed", minutes? }` → what the viewer did with a card. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    const { id } = await params;
    return NextResponse.json(await markCard(db, device, decodeURIComponent(id), await request.json()), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}