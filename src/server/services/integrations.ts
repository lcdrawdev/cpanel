import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/create";
import { apiKeys } from "../db/schema";
import { newToken, sha256 } from "../crypto";
import { ServiceError } from "./errors";
import { audit } from "./audit";

const KEY_PREFIX = "pak_";

export async function listApiKeys(db: Database) {
  return db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
}

/** Returns the full key once; afterwards only its prefix is shown. */
export async function createApiKey(db: Database, actor: string, name: string) {
  const label = name.trim();
  if (!label) throw new ServiceError("invalid", "Dê um nome à chave (ex.: integração do financeiro).");
  const key = `${KEY_PREFIX}${newToken(24)}`;
  const [row] = await db.insert(apiKeys).values({ name: label.slice(0, 60), prefix: key.slice(0, 12), keyHash: sha256(key) }).returning({ id: apiKeys.id });
  await audit(db, actor, "api_key.created", row.id);
  return { id: row.id, key };
}

export async function revokeApiKey(db: Database, actor: string, id: string) {
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
  await audit(db, actor, "api_key.revoked", id);
}

/** Resolves `Authorization: Bearer pak_…` to an active key, or throws 401. */
export async function authenticateApiKey(db: Database, authorization: string | null) {
  const key = authorization?.match(/^Bearer\s+(pak_\S+)$/i)?.[1];
  if (!key) throw new ServiceError("unauthorized", "Chave de API ausente.", 401);
  const row = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.keyHash, sha256(key)), isNull(apiKeys.revokedAt)) });
  if (!row) throw new ServiceError("unauthorized", "Chave de API inválida ou revogada.", 401);
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return row;
}
