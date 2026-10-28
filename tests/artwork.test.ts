import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/server/db/create";
import { addArtwork, artworkConfig, listArtwork, moveArtwork, removeArtwork } from "@/server/services/artwork";
import { getAccountSettings } from "@/server/services/account-settings";

let db: Database;
const actor = "teste@exemplo.com";

beforeEach(async () => {
  db = await createDatabase({ pgliteDir: "memory://" });
});

describe("capas e logos", () => {
  it("adds in order, replaces the link of a repeated name and tells the TVs", async () => {
    const before = (await getAccountSettings(db)).version;
    await addArtwork(db, actor, { kind: "service", name: "Netflix", imageUrl: "https://img/netflix.png" });
    await addArtwork(db, actor, { kind: "service", name: "Prime Video", imageUrl: "https://img/prime.png" });
    expect(await addArtwork(db, actor, { kind: "service", name: "NETFLIX", imageUrl: "https://img/netflix-2.png" })).toBe("updated");
    await addArtwork(db, actor, { kind: "series", name: "Doramas", imageUrl: "https://img/doramas.jpg" });
    expect((await getAccountSettings(db)).version).toBeGreaterThan(before);
    expect(await artworkConfig(db)).toEqual({
      services: [{ name: "NETFLIX", url: "https://img/netflix-2.png" }, { name: "Prime Video", url: "https://img/prime.png" }],
      series: [{ name: "Doramas", url: "https://img/doramas.jpg" }],
      movies: [],
    });
  });

  it("moves and removes", async () => {
    await addArtwork(db, actor, { kind: "movies", name: "Ação", imageUrl: "https://img/a.jpg" });
    await addArtwork(db, actor, { kind: "movies", name: "Terror", imageUrl: "https://img/t.jpg" });
    const terror = (await listArtwork(db)).find((a) => a.name === "Terror")!;
    await moveArtwork(db, actor, terror.id, "up");
    expect((await artworkConfig(db)).movies.map((m) => m.name)).toEqual(["Terror", "Ação"]);
    await removeArtwork(db, actor, terror.id);
    expect((await artworkConfig(db)).movies.map((m) => m.name)).toEqual(["Ação"]);
  });

  it("refuses something that is not an image link", async () => {
    await expect(addArtwork(db, actor, { kind: "series", name: "Kids", imageUrl: "C:\\fotos\\kids.png" })).rejects.toThrow(/link direto/);
  });
});
