import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/create";
import { activationCodes, deviceGroups, settingsProfiles } from "../db/schema";
import { newActivationCode } from "../crypto";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export async function listCodes(db: Database) {
  const rows = await db
    .select({
      id: activationCodes.id,
      code: activationCodes.code,
      label: activationCodes.label,
      uses: activationCodes.uses,
      maxUses: activationCodes.maxUses,
      enabled: activationCodes.enabled,
      expiresAt: activationCodes.expiresAt,
      playlistIds: activationCodes.playlistIds,
      profileName: settingsProfiles.name,
      groupName: deviceGroups.name,
      createdAt: activationCodes.createdAt,
    })
    .from(activationCodes)
    .leftJoin(settingsProfiles, eq(settingsProfiles.id, activationCodes.profileId))
    .leftJoin(deviceGroups, eq(deviceGroups.id, activationCodes.groupId))
    .orderBy(desc(activationCodes.createdAt));
  const now = Date.now();
  return rows.map((c) => ({ ...c, expired: c.expiresAt ? c.expiresAt.getTime() < now : false }));
}

export async function createCode(
  db: Database,
  actor: string,
  input: { label: string; maxUses: number; profileId: string | null; playlistIds: string[]; groupId?: string | null; expiresAt: Date | null },
) {
  const label = input.label.trim();
  if (!label) throw new ServiceError("invalid", "Informe um apelido para o código.");
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 10_000) {
    throw new ServiceError("invalid", "O limite de usos deve ser um número entre 1 e 10000.");
  }
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) throw new ServiceError("invalid", "A data de validade precisa estar no futuro.");
  // Retry on the (unlikely) collision with an existing code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newActivationCode();
    const clash = await db.query.activationCodes.findFirst({ where: eq(activationCodes.code, code) });
    if (clash) continue;
    const [row] = await db
      .insert(activationCodes)
      .values({ code, label, maxUses: input.maxUses, profileId: input.profileId, playlistIds: input.playlistIds, groupId: input.groupId ?? null, expiresAt: input.expiresAt })
      .returning();
    await audit(db, actor, "code.created", row.id);
    return row;
  }
  throw new ServiceError("code_generation", "Não foi possível gerar um código único. Tente de novo.", 500);
}

export async function setCodeEnabled(db: Database, actor: string, id: string, enabled: boolean) {
  await db.update(activationCodes).set({ enabled }).where(eq(activationCodes.id, id));
  await audit(db, actor, enabled ? "code.enabled" : "code.disabled", id);
}

export async function deleteCode(db: Database, actor: string, id: string) {
  await db.delete(activationCodes).where(eq(activationCodes.id, id));
  await audit(db, actor, "code.deleted", id);
}
