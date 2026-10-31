import zlib from "node:zlib";
import { eq } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/create";
import { appUpdates } from "../db/schema";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import { save as bumpAccountVersion } from "./account-settings";

/**
 * Lê o versionCode direto do APK (Luis, 2026-10-31): esse número manual era onde o envio OTA errava
 * (precisa ser maior que o instalado na TV). A lógica de comparação segue a mesma; o painel só deixa
 * de depender da digitação. Em qualquer falha, cai no número informado no formulário.
 *
 * O APK é um ZIP; o AndroidManifest.xml é XML binário (AXML). O atributo android:versionCode tem o
 * ID de recurso 0x0101021b — achamos o atributo por esse ID (sem depender de decodificar strings).
 */
function apkVersionCode(base64: string): number | null {
  try {
    const buf = Buffer.from(base64, "base64");
    const axml = extractEntry(buf, "AndroidManifest.xml");
    if (!axml || axml.length < 8 || axml.readUInt16LE(0) !== 0x0003) return null;
    let off = 8;
    let resMap: number[] | null = null;
    while (off + 8 <= axml.length) {
      const type = axml.readUInt16LE(off);
      const size = axml.readUInt32LE(off + 4);
      if (size < 8 || off + size > axml.length) break;
      if (type === 0x0180) {
        resMap = [];
        for (let i = 0; i < (size - 8) / 4; i++) resMap.push(axml.readUInt32LE(off + 8 + i * 4));
      } else if (type === 0x0102) {
        const attrExt = off + 16;
        const attrStart = axml.readUInt16LE(attrExt + 8);
        const attrCount = axml.readUInt16LE(attrExt + 12);
        const base = attrExt + attrStart;
        for (let i = 0; i < attrCount; i++) {
          const a = base + i * 20;
          if (a + 20 > axml.length) break;
          const nameIdx = axml.readUInt32LE(a + 4);
          if (resMap && nameIdx < resMap.length && resMap[nameIdx] === 0x0101021b) {
            const code = axml.readUInt32LE(a + 16) >>> 0;
            return code > 0 ? code : null;
          }
        }
        return null; // tag <manifest> encontrada, sem versionCode
      }
      off += size;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extrai um arquivo do ZIP varrendo os cabeçalhos locais (suficiente para o AndroidManifest do APK). */
function extractEntry(buf: Buffer, entryName: string): Buffer | null {
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const flags = buf.readUInt16LE(off + 6);
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString("utf8", off + 30, off + 30 + nameLen);
    const dataStart = off + 30 + nameLen + extraLen;
    // Descritor de dados (bit 3): tamanhos ficam no cabeçalho local zerados — não dá pra ler aqui.
    if (flags & 0x08 || compSize === 0 || dataStart + compSize > buf.length) return null;
    if (name === entryName) {
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    }
    off = dataStart + compSize;
  }
  return null;
}

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
  // Prefere o versionCode lido do próprio APK; só usa o número digitado se não der pra ler (ex.: não-Android).
  const fromApk = apkVersionCode(input.base64);
  const row = {
    version: input.version.trim(),
    versionCode: fromApk ?? (Number.isFinite(input.versionCode) ? input.versionCode : 0),
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
  // Bump the account version so every TV refetches its config on the next poll and sees the update.
  await bumpAccountVersion(db, {});
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
