import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/create";
import { catalogArtwork } from "../db/schema";
import { getAccountSettings, save } from "./account-settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export type ArtworkKind = "service" | "series" | "movies";
export const ARTWORK_KINDS: ArtworkKind[] = ["service", "series", "movies"];

const artworkSchema = z.object({
  kind: z.enum(["service", "series", "movies"]),
  name: z.string().trim().min(1, "Informe o nome.").max(80, "O nome aceita até 80 caracteres."),
  imageUrl: z.string().trim().max(1000).refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Use o link direto da imagem, começando com https://."),
});

export async function listArtwork(db: DbOrTx) {
  return db.select().from(catalogArtwork).orderBy(asc(catalogArtwork.kind), asc(catalogArtwork.position), asc(catalogArtwork.createdAt));
}

/** Any change bumps the account version, so every TV refetches its configuration right away. */
async function touchAccount(db: DbOrTx) {
  await getAccountSettings(db);
  await save(db, {});
}

/** Adds an image; a name that already exists in that list gets its link replaced instead. */
export async function addArtwork(db: DbOrTx, actor: string, input: z.input<typeof artworkSchema>) {
  const r = artworkSchema.safeParse(input);
  if (!r.success) throw new ServiceError("invalid", r.error.issues[0].message);
  const v = r.data;
  const same = await db.query.catalogArtwork.findFirst({ where: and(eq(catalogArtwork.kind, v.kind), sql`lower(${catalogArtwork.name}) = lower(${v.name})`) });
  if (same) {
    await db.update(catalogArtwork).set({ imageUrl: v.imageUrl, name: v.name }).where(eq(catalogArtwork.id, same.id));
  } else {
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${catalogArtwork.position}), -1) + 1` }).from(catalogArtwork).where(eq(catalogArtwork.kind, v.kind));
    await db.insert(catalogArtwork).values({ ...v, position: Number(next) });
  }
  await touchAccount(db);
  await audit(db, actor, `artwork.saved_${v.kind}`);
  return same ? "updated" : "added";
}

export async function removeArtwork(db: DbOrTx, actor: string, id: string) {
  await db.delete(catalogArtwork).where(eq(catalogArtwork.id, id));
  await touchAccount(db);
  await audit(db, actor, "artwork.removed", id);
}

/** Moves an image one place up or down inside its list (the order the TV shows). */
export async function moveArtwork(db: DbOrTx, actor: string, id: string, dir: "up" | "down") {
  const item = await db.query.catalogArtwork.findFirst({ where: eq(catalogArtwork.id, id) });
  if (!item) throw new ServiceError("not_found", "Imagem não encontrada.", 404);
  const list = (await listArtwork(db)).filter((a) => a.kind === item.kind);
  const i = list.findIndex((a) => a.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction(async (tx) => {
    for (const [pos, a] of list.entries()) await tx.update(catalogArtwork).set({ position: pos }).where(eq(catalogArtwork.id, a.id));
  });
  await touchAccount(db);
  await audit(db, actor, "artwork.moved", id);
}

/** Part of the device configuration, in the admin's order. */
export async function artworkConfig(db: DbOrTx) {
  const all = await listArtwork(db);
  const pick = (k: ArtworkKind) => all.filter((a) => a.kind === k).map((a) => ({ name: a.name, url: a.imageUrl }));
  return { services: pick("service"), series: pick("series"), movies: pick("movies") };
}
