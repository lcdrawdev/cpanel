import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addDevice, setDevicePlaylists } from "@/server/services/devices";
import { createPlaylist } from "@/server/services/playlists";
import { updatePolicies } from "@/server/services/account-settings";
import { listReports, reportChannel, reportStats, REPORTS_PER_HOUR, setReportStatus } from "@/server/services/reports";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("channel reports", () => {
  it("queues a report and flags duplicates while it is open", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "rep-device-01", nickname: "Sala" });
    const pl = await createPlaylist(db, actor, { name: "Lista", type: "m3u", url: "https://exemplo.com/l.m3u" });
    await setDevicePlaylists(db, actor, id, [pl.id]);

    const first = await reportChannel(db, id, { channelName: "Canal 1", reason: "Sem áudio", playlistId: pl.id });
    expect(first.alreadyReported).toBe(false);
    const dup = await reportChannel(db, id, { channelName: "canal 1", reason: "Travando", playlistId: pl.id });
    expect(dup.alreadyReported).toBe(true);

    const [open] = await listReports(db, "open");
    expect(open).toMatchObject({ channelName: "Canal 1", deviceNickname: "Sala", playlistName: "Lista" });

    await setReportStatus(db, actor, open.id, "resolved");
    expect(await reportStats(db)).toEqual({ open: 0, resolved: 1 });
    expect((await reportChannel(db, id, { channelName: "Canal 1", reason: "De novo", playlistId: pl.id })).alreadyReported).toBe(false);
  });

  it("ignores playlists that are not linked to the device", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "rep-device-01", nickname: "Sala" });
    const other = await createPlaylist(db, actor, { name: "Outra", type: "m3u", url: "https://exemplo.com/o.m3u" });
    await reportChannel(db, id, { channelName: "Canal X", reason: "Fora do ar", playlistId: other.id });
    expect((await listReports(db, "open"))[0].playlistName).toBeNull();
  });

  it("respects the account switch and the hourly limit", async () => {
    const { id } = await addDevice(db, actor, { deviceId: "rep-device-01", nickname: "Sala" });
    for (let i = 0; i < REPORTS_PER_HOUR; i++) await reportChannel(db, id, { channelName: `C${i}`, reason: "x" });
    await expect(reportChannel(db, id, { channelName: "C-extra", reason: "x" })).rejects.toThrow(/Muitos reportes/);

    await updatePolicies(db, actor, {
      accountNickname: "", supportUrl: "", welcomeMessage: "", forceUpdates: false, disableCloudBackups: false,
      channelReportsEnabled: false, alreadyReportedMessage: "",
    });
    await expect(reportChannel(db, id, { channelName: "C-off", reason: "x" })).rejects.toThrow(/desativado/);
  });
});
