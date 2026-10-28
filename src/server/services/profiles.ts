import { asc, count, eq, sql } from "drizzle-orm";
import type { Database } from "../db/create";
import { devices, settingsProfiles } from "../db/schema";
import { defaultSettings, settingsSchema } from "@/shared/settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export type ProfilePlatform = "tv" | "mobile" | "apple";

export async function listProfiles(db: Database) {
  return db
    .select({
      id: settingsProfiles.id,
      name: settingsProfiles.name,
      platform: settingsProfiles.platform,
      updatedAt: settingsProfiles.updatedAt,
      deviceCount: count(devices.id),
    })
    .from(settingsProfiles)
    .leftJoin(devices, eq(devices.profileId, settingsProfiles.id))
    .groupBy(settingsProfiles.id)
    .orderBy(asc(settingsProfiles.name));
}

export async function getProfile(db: Database, id: string) {
  const profile = await db.query.settingsProfiles.findFirst({ where: eq(settingsProfiles.id, id) });
  if (!profile) throw new ServiceError("not_found", "Perfil não encontrado.", 404);
  return profile;
}

export async function createProfile(db: Database, actor: string, input: { name: string; platform: ProfilePlatform }) {
  const name = input.name.trim();
  if (!name) throw new ServiceError("invalid", "Informe um nome para o perfil.");
  const [profile] = await db.insert(settingsProfiles).values({ name, platform: input.platform, settings: defaultSettings() }).returning();
  await audit(db, actor, "profile.created", profile.id);
  return profile;
}

export async function updateProfileSettings(db: Database, actor: string, id: string, settings: Record<string, unknown>) {
  const parsed = settingsSchema.parse(settings);
  const [profile] = await db
    .update(settingsProfiles)
    .set({ settings: parsed, updatedAt: new Date() })
    .where(eq(settingsProfiles.id, id))
    .returning();
  if (!profile) throw new ServiceError("not_found", "Perfil não encontrado.", 404);
  // Every device using this profile must fetch the new configuration.
  await db.update(devices).set({ configVersion: sql`${devices.configVersion} + 1` }).where(eq(devices.profileId, id));
  await audit(db, actor, "profile.settings_updated", id);
  return profile;
}

export async function deleteProfile(db: Database, actor: string, id: string) {
  await db.update(devices).set({ configVersion: sql`${devices.configVersion} + 1` }).where(eq(devices.profileId, id));
  await db.delete(settingsProfiles).where(eq(settingsProfiles.id, id));
  await audit(db, actor, "profile.deleted", id);
}
