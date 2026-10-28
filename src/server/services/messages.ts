import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/create";
import { deviceGroups, deviceMessages, devices } from "../db/schema";
import { getAccountSettings, save } from "./account-settings";
import { audit } from "./audit";
import { ServiceError } from "./errors";

export const messageSchema = z.object({
  title: z.string().trim().min(1, "Informe o título.").max(80, "O título aceita até 80 caracteres."),
  body: z.string().trim().min(1, "Escreva a mensagem.").max(1000, "A mensagem aceita até 1000 caracteres."),
  target: z.enum(["all", "group", "device"]),
  groupId: z.string().uuid().nullable(),
  deviceId: z.string().uuid().nullable(),
  days: z.number().int().min(0).max(365),
});

/** Sends a message to the app's notification bell. Every app refetches its configuration right away. */
export async function createMessage(db: DbOrTx, actor: string, input: z.input<typeof messageSchema>) {
  const v = messageSchema.safeParse(input);
  if (!v.success) throw new ServiceError("invalid", v.error.issues[0].message);
  const { title, body, target, days } = v.data;
  if (target === "group" && !v.data.groupId) throw new ServiceError("invalid", "Escolha o grupo.");
  if (target === "device" && !v.data.deviceId) throw new ServiceError("invalid", "Escolha o dispositivo.");
  await db.insert(deviceMessages).values({
    title,
    body,
    groupId: target === "group" ? v.data.groupId : null,
    deviceId: target === "device" ? v.data.deviceId : null,
    expiresAt: days > 0 ? new Date(Date.now() + days * 86400_000) : null,
  });
  await getAccountSettings(db);
  await save(db, {});
  await audit(db, actor, "message.created");
}

export async function deleteMessage(db: DbOrTx, actor: string, id: string) {
  const deleted = await db.delete(deviceMessages).where(eq(deviceMessages.id, id)).returning({ id: deviceMessages.id });
  if (!deleted.length) throw new ServiceError("not_found", "Aviso não encontrado.", 404);
  await save(db, {});
  await audit(db, actor, "message.deleted", id);
}

export async function listMessages(db: DbOrTx) {
  return db
    .select({
      id: deviceMessages.id,
      title: deviceMessages.title,
      body: deviceMessages.body,
      createdAt: deviceMessages.createdAt,
      expiresAt: deviceMessages.expiresAt,
      groupName: deviceGroups.name,
      deviceName: devices.nickname,
    })
    .from(deviceMessages)
    .leftJoin(deviceGroups, eq(deviceGroups.id, deviceMessages.groupId))
    .leftJoin(devices, eq(devices.id, deviceMessages.deviceId))
    .orderBy(desc(deviceMessages.createdAt));
}

/** Messages a device should show: for everyone, its group or itself, not expired, newest first. */
export async function messagesForDevice(db: DbOrTx, device: { id: string; groupId: string | null }) {
  const audience = [and(isNull(deviceMessages.groupId), isNull(deviceMessages.deviceId)), eq(deviceMessages.deviceId, device.id)];
  if (device.groupId) audience.push(eq(deviceMessages.groupId, device.groupId));
  const rows = await db
    .select({ id: deviceMessages.id, title: deviceMessages.title, body: deviceMessages.body, createdAt: deviceMessages.createdAt })
    .from(deviceMessages)
    .where(and(or(...audience), or(isNull(deviceMessages.expiresAt), gt(deviceMessages.expiresAt, new Date()))))
    .orderBy(desc(deviceMessages.createdAt))
    .limit(30);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
