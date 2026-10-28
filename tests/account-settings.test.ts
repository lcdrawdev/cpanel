import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice } from "@/server/services/devices";
import { activateDevice, configVersion, deviceConfig } from "@/server/services/device-api";
import { getAccountSettings, updateMaintenance, updatePolicies } from "@/server/services/account-settings";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

async function activeDevice() {
  const { id } = await addDevice(db, actor, { deviceId: "acc-device-01", nickname: "Sala" });
  const { config } = await activateDevice(db, { deviceId: "acc-device-01", platform: "android_tv" });
  return { id, config };
}

const policies = {
  accountNickname: "Suporte Exemplo",
  supportUrl: "https://suporte.exemplo.test",
  welcomeMessage: "Bem-vindo!",
  forceUpdates: true,
  disableCloudBackups: true,
  channelReportsEnabled: false,
  alreadyReportedMessage: "",
};

describe("account settings", () => {
  it("starts with maintenance off and sends it to devices", async () => {
    const { config } = await activeDevice();
    expect(config.account.maintenance.enabled).toBe(false);
    expect(config.account.policies.channelReportsEnabled).toBe(true);
    expect((await getAccountSettings(db)).version).toBe(1);
  });

  it("maintenance mode reaches every device and bumps their version", async () => {
    const { id, config } = await activeDevice();
    await updateMaintenance(db, actor, { enabled: true, message: "Voltamos às 14h.", supportLine: "WhatsApp 0000" });
    const after = await deviceConfig(db, id);
    expect(after.version).toBeGreaterThan(config.version);
    expect(after.account.maintenance).toEqual({ enabled: true, message: "Voltamos às 14h.", supportLine: "WhatsApp 0000" });
    const device = await db.query.devices.findFirst();
    expect(await configVersion(db, device!)).toBe(after.version);
  });

  it("requires a message to turn maintenance on and enforces limits", async () => {
    await expect(updateMaintenance(db, actor, { enabled: true, message: " ", supportLine: "" })).rejects.toThrow(/mensagem/);
    await expect(updateMaintenance(db, actor, { enabled: false, message: "", supportLine: "x".repeat(101) })).rejects.toThrow(/100 caracteres/);
  });

  it("saves policies and validates the support link", async () => {
    const { id } = await activeDevice();
    await updatePolicies(db, actor, policies);
    const { account } = await deviceConfig(db, id);
    expect(account.nickname).toBe("Suporte Exemplo");
    expect(account.policies).toMatchObject({ forceUpdates: true, disableCloudBackups: true, channelReportsEnabled: false });
    await expect(updatePolicies(db, actor, { ...policies, supportUrl: "javascript:alert(1)" })).rejects.toThrow(/http/);
  });
});
