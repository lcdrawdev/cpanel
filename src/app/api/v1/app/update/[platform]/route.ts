import { getDb } from "@/server/db/client";
import { updateFileFor, type Platform } from "@/server/services/app-updates";
import { apiError } from "@/server/http/device-route";

/** GET the published package for a platform (the TV downloads the APK from here to install). */
export async function GET(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  try {
    const { platform } = await params;
    const db = await getDb();
    const file = await updateFileFor(db, platform as Platform);
    if (!file) return new Response("Sem atualização publicada.", { status: 404 });
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\w.\-]/g, "_")}"`,
        "Content-Length": String(file.buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
