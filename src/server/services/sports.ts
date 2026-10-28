import { z } from "zod";
import type { DbOrTx } from "../db/create";
import { SPORT_IDS } from "@/shared/sports";
import { getAccountSettings, save } from "./account-settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export async function updateSportsMode(db: DbOrTx, actor: string, input: { enabled: boolean; hiddenSports: string[] }) {
  const hidden = z.array(z.enum(SPORT_IDS)).safeParse([...new Set(input.hiddenSports)]);
  if (!hidden.success) throw new ServiceError("invalid", "Esporte desconhecido.");
  await getAccountSettings(db);
  await save(db, { sportsEnabled: input.enabled, hiddenSports: hidden.data });
  await audit(db, actor, "sports.updated");
}

const entrySchema = z.object({
  sport: z.enum(SPORT_IDS),
  kind: z.enum(["league", "country", "team"]),
  name: z.string().trim().min(1, "Informe o nome.").max(80),
});

/** Hides a league, country or team inside a sport (case-insensitive, no duplicates). */
export async function hideSportEntry(db: DbOrTx, actor: string, input: z.input<typeof entrySchema>) {
  const v = entrySchema.safeParse(input);
  if (!v.success) throw new ServiceError("invalid", v.error.issues[0].message);
  const s = await getAccountSettings(db);
  const exists = s.hiddenSportEntries.some((e) => e.sport === v.data.sport && e.kind === v.data.kind && e.name.toLowerCase() === v.data.name.toLowerCase());
  if (exists) return false;
  if (s.hiddenSportEntries.length >= 500) throw new ServiceError("invalid", "Limite de 500 itens ocultos atingido.");
  await save(db, { hiddenSportEntries: [...s.hiddenSportEntries, v.data] });
  await audit(db, actor, "sports.entry_hidden");
  return true;
}

export async function unhideSportEntry(db: DbOrTx, actor: string, index: number) {
  const s = await getAccountSettings(db);
  if (!s.hiddenSportEntries[index]) throw new ServiceError("not_found", "Item não encontrado.", 404);
  await save(db, { hiddenSportEntries: s.hiddenSportEntries.filter((_, i) => i !== index) });
  await audit(db, actor, "sports.entry_shown");
}
