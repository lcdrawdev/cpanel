import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/create";
import { predefinedPortals } from "../db/schema";
import { getAccountSettings, save } from "./account-settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export async function listPredefinedPortals(db: Database) {
  return db.select().from(predefinedPortals).orderBy(asc(predefinedPortals.type), asc(predefinedPortals.name));
}

const httpUrl = (msg: string) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((v) => {
      try {
        const u = new URL(v);
        return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password;
      } catch {
        return false;
      }
    }, msg);

const portalSchema = z.object({
  type: z.enum(["xtream", "stalker"]),
  name: z.string().trim().min(1, "Informe um nome.").max(60),
  url: httpUrl("URL inválida: use http:// ou https:// e não coloque usuário ou senha na URL."),
});

export async function addPredefinedPortal(db: Database, actor: string, input: z.input<typeof portalSchema>) {
  const v = parse(portalSchema, input);
  const [row] = await db.insert(predefinedPortals).values({ ...v, url: new URL(v.url).toString() }).returning({ id: predefinedPortals.id });
  await getAccountSettings(db);
  await save(db, {});
  await audit(db, actor, "portal.added", row.id);
}

export async function removePredefinedPortal(db: Database, actor: string, id: string) {
  await db.delete(predefinedPortals).where(eq(predefinedPortals.id, id));
  await getAccountSettings(db);
  await save(db, {});
  await audit(db, actor, "portal.removed", id);
}

/** Only one portal type can be active at a time (like the reference: XC or Stalker/MAG). */
export async function setPortalMode(db: Database, actor: string, mode: "off" | "xtream" | "stalker") {
  if (mode !== "off") {
    const any = await db.query.predefinedPortals.findFirst({ where: eq(predefinedPortals.type, mode) });
    if (!any) throw new ServiceError("invalid", `Cadastre pelo menos um portal ${mode === "xtream" ? "XC" : "Stalker/MAG"} antes de ativar este modo.`);
  }
  await getAccountSettings(db);
  await save(db, { portalMode: mode });
  await audit(db, actor, `portal.mode_${mode}`);
}

const brandingSchema = z.object({
  logoUrl: z.union([z.literal(""), httpUrl("O logo precisa ser uma URL http(s) direta para a imagem.")]),
  homeLine: z.string().trim().max(80, "O texto da tela inicial aceita até 80 caracteres."),
  userAgent: z.string().trim().max(200, "O User-Agent aceita até 200 caracteres."),
  activationCodeHint: z.string().trim().max(300, "O texto do código aceita até 300 caracteres."),
});

export async function updateBranding(db: Database, actor: string, input: z.input<typeof brandingSchema>) {
  const v = parse(brandingSchema, input);
  await getAccountSettings(db);
  await save(db, { brandLogoUrl: v.logoUrl, brandHomeLine: v.homeLine, userAgent: v.userAgent, activationCodeHint: v.activationCodeHint });
  await audit(db, actor, "portal.branding_updated");
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError("invalid", result.error.issues[0].message);
  return result.data;
}
