import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/create";
import { channelReports, devicePlaylists, devices, playlists } from "../db/schema";
import { getAccountSettings } from "./account-settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import { notify } from "./notifications";

/** Per-device limit so a stuck remote button cannot flood the queue. */
export const REPORTS_PER_HOUR = 20;

export const reportSchema = z.object({
  channelName: z.string().trim().min(1, "channelName obrigatório").max(120),
  channelId: z.string().trim().max(120).optional(),
  playlistId: z.string().uuid().optional(),
  reason: z.string().trim().min(1, "reason obrigatório").max(200),
});

/**
 * Device reports a channel. Returns `alreadyReported` (and the account message for that case)
 * when the same channel already has an open report.
 */
export async function reportChannel(db: Database, deviceUuid: string, input: z.infer<typeof reportSchema>) {
  const account = await getAccountSettings(db);
  if (!account.channelReportsEnabled) throw new ServiceError("reports_disabled", "O reporte de canais está desativado nesta conta.", 403);

  const [recent] = await db
    .select({ n: count() })
    .from(channelReports)
    .where(and(eq(channelReports.deviceId, deviceUuid), gt(channelReports.createdAt, new Date(Date.now() - 3_600_000))));
  if (recent.n >= REPORTS_PER_HOUR) throw new ServiceError("rate_limited", "Muitos reportes em pouco tempo. Tente mais tarde.", 429);

  // Only accept a playlist that is actually linked to this device.
  let playlistId: string | null = null;
  if (input.playlistId) {
    const linked = await db.query.devicePlaylists.findFirst({
      where: and(eq(devicePlaylists.deviceId, deviceUuid), eq(devicePlaylists.playlistId, input.playlistId)),
    });
    playlistId = linked ? input.playlistId : null;
  }

  const open = await db.query.channelReports.findFirst({
    where: and(
      eq(channelReports.status, "open"),
      eq(sql`lower(${channelReports.channelName})`, input.channelName.toLowerCase()),
      playlistId ? eq(channelReports.playlistId, playlistId) : isNull(channelReports.playlistId),
    ),
  });
  if (open) return { alreadyReported: true, message: account.alreadyReportedMessage || null };

  const [row] = await db
    .insert(channelReports)
    .values({ deviceId: deviceUuid, playlistId, channelName: input.channelName, channelId: input.channelId ?? null, reason: input.reason })
    .returning({ id: channelReports.id });
  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceUuid) });
  await notify(db, "channel_report", `Canal reportado: ${input.channelName}`, `"${device?.nickname ?? "Dispositivo"}" reportou o canal "${input.channelName}": ${input.reason}`);
  return { alreadyReported: false, id: row.id };
}

export async function listReports(db: Database, status: "open" | "resolved") {
  return db
    .select({
      id: channelReports.id,
      channelName: channelReports.channelName,
      reason: channelReports.reason,
      status: channelReports.status,
      createdAt: channelReports.createdAt,
      resolvedAt: channelReports.resolvedAt,
      deviceUuid: devices.id,
      deviceNickname: devices.nickname,
      playlistName: playlists.name,
    })
    .from(channelReports)
    .innerJoin(devices, eq(devices.id, channelReports.deviceId))
    .leftJoin(playlists, eq(playlists.id, channelReports.playlistId))
    .where(eq(channelReports.status, status))
    .orderBy(desc(channelReports.createdAt))
    .limit(200);
}

export async function reportStats(db: Database) {
  const [row] = await db
    .select({
      open: count(sql`case when ${channelReports.status} = 'open' then 1 end`),
      resolved: count(sql`case when ${channelReports.status} = 'resolved' then 1 end`),
    })
    .from(channelReports);
  return row;
}

export async function setReportStatus(db: Database, actor: string, id: string, status: "open" | "resolved") {
  const [row] = await db
    .update(channelReports)
    .set({ status, resolvedAt: status === "resolved" ? new Date() : null })
    .where(eq(channelReports.id, id))
    .returning({ id: channelReports.id });
  if (!row) throw new ServiceError("not_found", "Reporte não encontrado.", 404);
  await audit(db, actor, status === "resolved" ? "report.resolved" : "report.reopened", id);
}
