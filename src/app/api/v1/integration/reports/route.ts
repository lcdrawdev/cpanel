import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateApiKey } from "@/server/services/integrations";
import { listReports } from "@/server/services/reports";
import { apiError, noStore } from "@/server/http/device-route";

/** GET ?status=open|resolved with `Authorization: Bearer pak_…` → channel reports for integrations. */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    await authenticateApiKey(db, request.headers.get("authorization"));
    const status = new URL(request.url).searchParams.get("status") === "resolved" ? "resolved" : "open";
    return NextResponse.json({ reports: await listReports(db, status) }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
