import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/create";
import { devices, settingsProfiles } from "../db/schema";
import { resolveSettings, settingsSchema } from "@/shared/settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

/**
 * Stores only the values that differ from the device's profile, so later profile
 * changes still reach every setting the admin did not customize on this device.
 */
export async function setDeviceOverrides(db: Database, actor: string, deviceUuid: string, values: Record<string, unknown>) {
  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceUuid) });
  if (!device) throw new ServiceError("not_found", "Dispositivo não encontrado.", 404);
  const profile = device.profileId ? await db.query.settingsProfiles.findFirst({ where: eq(settingsProfiles.id, device.profileId) }) : null;
  const base = resolveSettings(profile?.settings);
  const parsed = settingsSchema.parse(values);
  const overrides = Object.fromEntries(Object.entries(parsed).filter(([k, v]) => v !== undefined && base[k as keyof typeof base] !== v));
  await db
    .update(devices)
    .set({ settingsOverrides: overrides, configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() })
    .where(eq(devices.id, deviceUuid));
  await audit(db, actor, "device.overrides_set", deviceUuid);
  return Object.keys(overrides).length;
}

export async function clearDeviceOverrides(db: Database, actor: string, deviceUuid: string) {
  await db
    .update(devices)
    .set({ settingsOverrides: {}, configVersion: sql`${devices.configVersion} + 1`, updatedAt: new Date() })
    .where(eq(devices.id, deviceUuid));
  await audit(db, actor, "device.overrides_cleared", deviceUuid);
}
