import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/create";
import { accountSettings, predefinedPortals } from "../db/schema";
import { audit } from "./audit";
import { ServiceError } from "./errors";
import { brandingConfig } from "./app-appearance";

const ROW_ID = 1;

/** Reads the single settings row, creating it with defaults on first use. */
export async function getAccountSettings(db: DbOrTx) {
  const row = await db.query.accountSettings.findFirst({ where: eq(accountSettings.id, ROW_ID) });
  if (row) return row;
  const [created] = await db.insert(accountSettings).values({ id: ROW_ID }).onConflictDoNothing().returning();
  return created ?? (await db.query.accountSettings.findFirst({ where: eq(accountSettings.id, ROW_ID) }))!;
}

export const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(1000, "A mensagem principal aceita até 1000 caracteres."),
  supportLine: z.string().trim().max(100, "A linha de suporte aceita até 100 caracteres."),
});

export async function updateMaintenance(db: DbOrTx, actor: string, input: z.input<typeof maintenanceSchema>) {
  const v = parse(maintenanceSchema, input);
  if (v.enabled && !v.message) throw new ServiceError("invalid", "Escreva a mensagem que os usuários vão ver durante a manutenção.");
  await getAccountSettings(db);
  await save(db, { maintenanceEnabled: v.enabled, maintenanceMessage: v.message, maintenanceSupportLine: v.supportLine });
  await audit(db, actor, v.enabled ? "maintenance.enabled" : "maintenance.updated");
}

export const policiesSchema = z.object({
  accountNickname: z.string().trim().max(60, "O apelido da conta aceita até 60 caracteres."),
  supportUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "O link de suporte deve começar com http:// ou https://."),
  welcomeMessage: z.string().trim().max(1000, "A mensagem de boas-vindas aceita até 1000 caracteres."),
  forceUpdates: z.boolean(),
  disableCloudBackups: z.boolean(),
  channelReportsEnabled: z.boolean(),
  alreadyReportedMessage: z.string().trim().max(1000, "A mensagem de canal já reportado aceita até 1000 caracteres."),
});

export async function updatePolicies(db: DbOrTx, actor: string, input: z.input<typeof policiesSchema>) {
  const v = parse(policiesSchema, input);
  await getAccountSettings(db);
  await save(db, v);
  await audit(db, actor, "policies.updated");
}

/** Part of the device configuration that comes from the account (see device-api.ts). */
export function accountConfig(s: Awaited<ReturnType<typeof getAccountSettings>>, portals: (typeof predefinedPortals.$inferSelect)[]) {
  return {
    nickname: s.accountNickname || null,
    supportUrl: s.supportUrl || null,
    welcomeMessage: s.welcomeMessage || null,
    policies: {
      forceUpdates: s.forceUpdates,
      disableCloudBackups: s.disableCloudBackups,
      channelReportsEnabled: s.channelReportsEnabled,
      alreadyReportedMessage: s.alreadyReportedMessage || null,
    },
    maintenance: { enabled: s.maintenanceEnabled, message: s.maintenanceMessage || null, supportLine: s.maintenanceSupportLine || null },
    sports: { enabled: s.sportsEnabled, hiddenSports: s.hiddenSports, hiddenEntries: s.hiddenSportEntries, groupKeywords: s.sportsGroupKeywords },
    branding: brandingConfig(s),
    predefinedPortal:
      s.portalMode === "off"
        ? null
        : {
            type: s.portalMode,
            portals: portals.filter((p) => p.type === s.portalMode).map(({ id, name, url }) => ({ id, name, url })),
            logoUrl: s.brandLogoUrl || null,
            homeLine: s.brandHomeLine || null,
            userAgent: s.userAgent || null,
            activationCodeHint: s.activationCodeHint || null,
          },
  };
}

/** Saves account-level values and bumps the account version (every app refetches). */
export async function save(db: DbOrTx, values: Partial<typeof accountSettings.$inferInsert>) {
  await db
    .update(accountSettings)
    .set({ ...values, version: sql`${accountSettings.version} + 1`, updatedAt: new Date() })
    .where(eq(accountSettings.id, ROW_ID));
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError("invalid", result.error.issues[0].message);
  return result.data;
}
