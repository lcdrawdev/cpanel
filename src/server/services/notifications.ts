import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/create";
import { notifications } from "../db/schema";
import { getAccountSettings, save } from "./account-settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export type NotificationKind = "device_added" | "device_removed" | "channel_report";

const PREF: Record<NotificationKind, "notifyDeviceAdded" | "notifyDeviceRemoved" | "notifyChannelReport"> = {
  device_added: "notifyDeviceAdded",
  device_removed: "notifyDeviceRemoved",
  channel_report: "notifyChannelReport",
};

/** Queues an e-mail alert if the account has an address and that alert type is on. */
export async function notify(db: DbOrTx, kind: NotificationKind, subject: string, body: string) {
  const s = await getAccountSettings(db);
  if (!s.notifyEmail || !s[PREF[kind]]) return;
  await db.insert(notifications).values({ kind, email: s.notifyEmail, subject, body });
  // Deliver in the background; failures stay visible in the outbox.
  if (mailConfigured()) void flushNotifications(db).catch((e) => console.error("mail flush failed", e));
}

export async function recentNotifications(db: DbOrTx, limit = 20) {
  return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

const prefsSchema = z.object({
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido.")]),
  deviceAdded: z.boolean(),
  deviceRemoved: z.boolean(),
  channelReport: z.boolean(),
});

export async function updateNotificationPrefs(db: DbOrTx, actor: string, input: z.input<typeof prefsSchema>) {
  const v = prefsSchema.safeParse({ ...input, email: input.email.trim() });
  if (!v.success) throw new ServiceError("invalid", v.error.issues[0].message);
  await getAccountSettings(db);
  // Notification prefs do not affect devices, but save() also bumps the account version; acceptable (one extra refetch).
  await save(db, { notifyEmail: v.data.email, notifyDeviceAdded: v.data.deviceAdded, notifyDeviceRemoved: v.data.deviceRemoved, notifyChannelReport: v.data.channelReport });
  await audit(db, actor, "notifications.updated");
}

/** True when SMTP is configured; otherwise alerts stay in the outbox as "pending". */
export function mailConfigured() {
  return Boolean(process.env.SMTP_URL && process.env.MAIL_FROM);
}

/**
 * Sends pending alerts through SMTP (SMTP_URL, e.g. smtps://user:pass@host:465, and MAIL_FROM).
 * Called after each queued alert and from the Notifications page; safe to call repeatedly.
 */
export async function flushNotifications(db: DbOrTx) {
  if (!mailConfigured()) return { sent: 0, failed: 0 };
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(process.env.SMTP_URL);
  const pending = await db.select().from(notifications).where(eq(notifications.status, "pending")).limit(50);
  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    try {
      await transport.sendMail({ from: process.env.MAIL_FROM, to: n.email, subject: n.subject, text: n.body });
      await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, n.id));
      sent++;
    } catch (e) {
      console.error("mail send failed", n.id, e instanceof Error ? e.message : e);
      await db.update(notifications).set({ status: "failed" }).where(eq(notifications.id, n.id));
      failed++;
    }
  }
  return { sent, failed };
}
