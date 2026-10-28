// One-off: registers the logos and folder covers Luis sent (2026-10-28) in Capas e logos.
// Run with the panel stopped (PGlite allows one process): npx tsx scripts/seed-artwork.ts
import path from "node:path";
import { createDatabase } from "../src/server/db/create";
import { addArtwork } from "../src/server/services/artwork";

const SERVICES: [string, string][] = [
  ["Netflix", "https://i.imgur.com/jsAWpq8.png"],
  ["Prime Video", "https://i.imgur.com/WJBe1Od.png"],
  ["HBO Max", "https://i.imgur.com/XIaZ5gm.png"],
  ["Globoplay", "https://i.imgur.com/PZFWu4S.png"],
  ["+SBT", "https://i.imgur.com/vkXbwLR.png"],
  ["Disney+", "https://i.imgur.com/Zkb68qZ.png"],
  ["Star+", "https://i.imgur.com/63qZstz.png"],
  ["Paramount+", "https://i.imgur.com/a8wNGiD.png"],
  ["Apple TV+", "https://i.imgur.com/8aIkfZz.png"],
  ["Peacock", "https://i.imgur.com/WgS6nqu.jpeg"],
  ["AMC+", "https://i.imgur.com/sMm6AEL.png"],
  ["Discovery+", "https://i.imgur.com/I1qwhIv.jpeg"],
];
const SERIES_FOLDERS: [string, string][] = [
  ["Doramas", "https://i.imgur.com/3nk3XlU.png"],
  ["Kids", "https://i.imgur.com/XbtKcMa.png"],
  ["Tokusatsus", "https://i.imgur.com/NKfL3nS.png"],
  ["Turcas-Árabe", "https://i.imgur.com/PsN6Kzk.jpeg"],
  ["Fé e Espiritualidade", "https://i.imgur.com/FXjn6ho.jpeg"],
  ["Reality", "https://i.imgur.com/edx7c0x.jpeg"],
  ["Docs", "https://i.imgur.com/FX0Kk69.jpeg"],
  ["Animes", "https://i.imgur.com/kXTsD5e.jpeg"],
  ["Novelas", "https://i.imgur.com/beiUiue.jpeg"],
  ["Diversas", "https://i.imgur.com/Xvdf7et.jpeg"],
];

async function main() {
  const db = await createDatabase({ pgliteDir: process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite") });
  const actor = "seed-artwork";
  for (const [name, imageUrl] of SERVICES) console.log("serviço", name, await addArtwork(db, actor, { kind: "service", name, imageUrl }));
  for (const [name, imageUrl] of SERIES_FOLDERS) console.log("pasta de séries", name, await addArtwork(db, actor, { kind: "series", name, imageUrl }));
  process.exit(0);
}

void main();
