import { getDb } from "@/server/db/client";
import { getAccountSettings } from "@/server/services/account-settings";
import { decodeLogo } from "@/server/services/app-appearance";

/** Public: the app logo uploaded in Aparência do app. The `v` query string changes with the image. */
export async function GET() {
  const logo = decodeLogo(await getAccountSettings(await getDb()));
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: { "Content-Type": logo.type, "Cache-Control": "public, max-age=86400" },
  });
}
