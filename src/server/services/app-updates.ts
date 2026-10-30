import { eq } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/create";
import { appUpdates } from "../db/schema";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export type Platform = (typeof appUpdates.$inferSelect)["platform"];

/** Platforms that can download-and-install the package straight from the TV (sideloaded Android). */
export const SELF_UPDATING: Platform[] = ["android_tv", "android_mobile"];

const MAX_BYTES = 60 * 1024 * 1024;

export type ImportInput = {
  platform: Platform;
  version: string;
  versionCode: number;
  notes: string;
  mandatory: boolean;
  fileName: string;
  fileSize: number;
  base64: string;
};

/** Imports (or replaces) the package for a platform. It arrives as a draft: `published` stays false until "Enviar". */
export async function importUpdate(db: Database, actor: string, input: ImportInput) {
  if (!input.version.trim()) throw new ServiceError("invalid", "Informe a versão (ex.: 0.18.9).");
  if (input.fileSize <= 0 || input.fileSize > MAX_BYTES) throw new ServiceError("invalid", "Arquivo vazio ou maior que 60 MB.");
  const row = {
    version: input.version.trim(),
    versionCode: Number.isFinite(input.versionCode) ? input.versionCode : 0,
    notes: input.notes.trim(),
    mandatory: input.mandatory,
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileData: input.base64,
    published: false,
    updatedAt: new Date(),
  };
  await db.insert(appUpdates).values({ platform: input.platform, ...row }).onConflictDoUpdate({ target: appUpdates.platform, set: row });
  await audit(db, actor, "app_update.imported", input.platform);
}

/** "Enviar atualização": turns the update on (or off) for a platform so the TVs start seeing the prompt. */
export async function publishUpdate(db: Database, actor: string, platform: Platform, published: boolean) {
  const [row] = await db.update(appUpdates).set({ published, updatedAt: new Date() }).where(eq(appUpdates.platform, platform)).returning({ version: appUpdates.version });
  if (!row) throw new ServiceError("not_found", "Importe o arquivo antes de enviar.", 404);
  await audit(db, actor, published ? "app_update.published" : "app_update.unpublished", platform);
}

export async function deleteUpdate(db: Database, actor: string, platform: Platform) {
  await db.delete(appUpdates).where(eq(appUpdates.platform, platform));
  await audit(db, actor, "app_update.removed", platform);
}

/** Metadata of every imported update (without the file bytes), for the panel list. */
export async function listUpdates(db: DbOrTx) {
  return db
    .select({
      platform: appUpdates.platform, version: appUpdates.version, versionCode: appUpdates.versionCode,
      notes: appUpdates.notes, mandatory: appUpdates.mandatory, fileName: appUpdates.fileName,
      fileSize: appUpdates.fileSize, published: appUpdates.published, updatedAt: appUpdates.updatedAt,
    })
    .from(appUpdates);
}

/** The published update for a platform (metadata only), or null. Used in the device config. */
export async function publishedUpdateFor(db: DbOrTx, platform: Platform) {
  const row = await db.query.appUpdates.findFirst({ where: eq(appUpdates.platform, platform) });
  if (!row || !row.published) return null;
  return { version: row.version, versionCode: row.versionCode, notes: row.notes, mandatory: row.mandatory, fileName: row.fileName, fileSize: row.fileSize };
}

/** The package bytes for download. Only a published update is served. */
export async function updateFileFor(db: DbOrTx, platform: Platform) {
  const row = await db.query.appUpdates.findFirst({ where: eq(appUpdates.platform, platform) });
  if (!row || !row.published) return null;
  return { fileName: row.fileName, buffer: Buffer.from(row.fileData, "base64") };
}
