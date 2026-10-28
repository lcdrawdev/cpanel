import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { authenticateDevice, configVersion } from "@/server/services/device-api";
import { getAccountSettings } from "@/server/services/account-settings";
import { addFavorite, removeFavorite } from "@/server/services/sync";
import { ServiceError } from "@/server/services/errors";
import { apiError, noStore } from "@/server/http/device-route";

const bodySchema = z.object({
  add: z.array(z.object({ channelName: z.string(), playlistId: z.string().uuid().optional() })).max(50).default([]),
  remove: z.array(z.string()).max(50).default([]),
});

/** POST { add?: [{ channelName, playlistId? }], remove?: [channelName] } → { version } — shared favorites of the sync pool. */
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const device = await authenticateDevice(db, request.headers.get("authorization"));
    const account = await getAccountSettings(db);
    if (!account.syncEnabled || !account.syncFavorites || !device.syncEnabled) {
      throw new ServiceError("sync_disabled", "A sincronização de favoritos não está ativa para este dispositivo.", 403);
    }
    const body = bodySchema.parse(await request.json());
    const actor = `device:${device.deviceId}`;
    for (const f of body.add) await addFavorite(db, actor, f);
    for (const name of body.remove) await removeFavorite(db, actor, { channelName: name });
    return NextResponse.json({ version: await configVersion(db, device) }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
