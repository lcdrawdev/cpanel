import { createHash } from "node:crypto";
import { z } from "zod";
import type { DbOrTx } from "../db/create";
import { decryptSecret, encryptSecret } from "../crypto";
import { getAccountSettings, save } from "./account-settings";
import { audit } from "./audit";
import { ServiceError } from "./errors";

type Settings = Awaited<ReturnType<typeof getAccountSettings>>;

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX_BYTES = 512 * 1024;

export const appearanceSchema = z.object({
  appName: z.string().trim().max(40, "O nome do app aceita até 40 caracteres."),
  homeShowFavorites: z.boolean(),
  homeShowSport: z.boolean(),
  homeShowTrending: z.boolean(),
  tmdbLanguage: z.enum(["pt-BR", "pt-PT", "es-ES", "en-US"]),
  sportsGroupKeywords: z.array(z.string().trim().min(1).max(40)).max(40, "Até 40 palavras."),
});

/**
 * Saves the app appearance. `logo` replaces the current one (null keeps it), `removeLogo` clears it,
 * `tmdbKey` replaces the TMDB key (empty keeps it) and is validated against TMDB before saving.
 */
export async function updateAppearance(
  db: DbOrTx,
  actor: string,
  input: z.input<typeof appearanceSchema> & { logo: File | null; removeLogo: boolean; tmdbKey: string; removeTmdbKey: boolean },
) {
  const v = appearanceSchema.safeParse(input);
  if (!v.success) throw new ServiceError("invalid", v.error.issues[0].message);
  const values: Record<string, unknown> = { ...v.data, sportsGroupKeywords: [...new Set(v.data.sportsGroupKeywords.map((k) => k.toUpperCase()))] };

  if (input.removeLogo) values.appLogo = "";
  else if (input.logo && input.logo.size > 0) {
    if (!LOGO_TYPES.includes(input.logo.type)) throw new ServiceError("invalid", "O logo deve ser PNG, JPG ou WebP.");
    if (input.logo.size > LOGO_MAX_BYTES) throw new ServiceError("invalid", "O logo deve ter até 512 KB.");
    values.appLogo = `data:${input.logo.type};base64,${Buffer.from(await input.logo.arrayBuffer()).toString("base64")}`;
  }

  let checked: number | null = null;
  if (input.removeTmdbKey) values.tmdbKey = "";
  else if (input.tmdbKey.trim()) {
    const key = input.tmdbKey.trim();
    checked = (await fetchTrending(key, v.data.tmdbLanguage)).length;
    values.tmdbKey = encryptSecret(key);
  }

  await getAccountSettings(db);
  await save(db, values);
  trendingCache = null;
  await audit(db, actor, "appearance.updated");
  return checked;
}

/** Version token of the logo, so the app reloads it only when it changes. */
export function logoVersion(s: Settings) {
  return s.appLogo ? createHash("sha256").update(s.appLogo).digest("hex").slice(0, 12) : null;
}

export function decodeLogo(s: Settings): { type: string; bytes: Buffer } | null {
  const m = s.appLogo.match(/^data:([\w/+.-]+);base64,(.+)$/);
  return m ? { type: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}

/** Part of the device configuration: name, logo path (relative to the panel) and which home sections show. */
export function brandingConfig(s: Settings) {
  const v = logoVersion(s);
  return {
    appName: s.appName || null,
    logoPath: v ? `/api/v1/branding/logo?v=${v}` : null,
    home: { favorites: s.homeShowFavorites, sport: s.homeShowSport, trending: s.homeShowTrending && !!s.tmdbKey },
  };
}

// ---------- TMDB "Programação em alta" ----------

export type TrendingItem = {
  tmdbId: number;
  type: "movie" | "series" | "anime";
  title: string;
  originalTitle: string;
  overview: string;
  year: string | null;
  score: number;
  backdrop: string | null;
  poster: string | null;
};

const IMG = "https://image.tmdb.org/t/p";
let trendingCache: { at: number; lang: string; items: TrendingItem[] } | null = null;

type TmdbResult = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  backdrop_path?: string | null;
  poster_path?: string | null;
  genre_ids?: number[];
  origin_country?: string[];
  original_language?: string;
};

/** v4 read tokens are long JWTs (sent as Bearer); v3 keys go in the query string. */
async function tmdb(key: string, path: string, lang: string): Promise<TmdbResult[]> {
  const bearer = key.length > 60;
  const url = `https://api.themoviedb.org/3${path}?language=${encodeURIComponent(lang)}${bearer ? "" : `&api_key=${encodeURIComponent(key)}`}`;
  const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${key}` } : {}, cache: "no-store" });
  if (res.status === 401) throw new ServiceError("invalid", "A chave do TMDB foi recusada. Confira se copiou a chave de API (v3) ou o token de leitura (v4).");
  if (!res.ok) throw new ServiceError("unavailable", `O TMDB respondeu com erro ${res.status}.`, 502);
  return ((await res.json()) as { results?: TmdbResult[] }).results ?? [];
}

async function fetchTrending(key: string, lang: string): Promise<TrendingItem[]> {
  const [movies, tv] = await Promise.all([tmdb(key, "/trending/movie/week", lang), tmdb(key, "/trending/tv/week", lang)]);
  const map = (r: TmdbResult, kind: "movie" | "tv"): TrendingItem => {
    const anime = kind === "tv" && (r.genre_ids ?? []).includes(16) && (r.original_language === "ja" || (r.origin_country ?? []).includes("JP"));
    const date = r.release_date || r.first_air_date || "";
    return {
      tmdbId: r.id,
      type: kind === "movie" ? "movie" : anime ? "anime" : "series",
      title: r.title || r.name || "",
      originalTitle: r.original_title || r.original_name || "",
      overview: r.overview || "",
      year: date ? date.slice(0, 4) : null,
      score: Math.round((r.vote_average ?? 0) * 10),
      backdrop: r.backdrop_path ? `${IMG}/w780${r.backdrop_path}` : null,
      poster: r.poster_path ? `${IMG}/w342${r.poster_path}` : null,
    };
  };
  // Interleave movies and series so the row mixes both.
  const out: TrendingItem[] = [];
  for (let i = 0; i < Math.max(movies.length, tv.length); i++) {
    if (movies[i]) out.push(map(movies[i], "movie"));
    if (tv[i]) out.push(map(tv[i], "tv"));
  }
  return out.filter((i) => i.title);
}

/** Trending titles for the devices, cached for an hour. Empty when no key is configured. */
export async function trending(db: DbOrTx): Promise<TrendingItem[]> {
  const s = await getAccountSettings(db);
  if (!s.tmdbKey || !s.homeShowTrending) return [];
  if (trendingCache && trendingCache.lang === s.tmdbLanguage && Date.now() - trendingCache.at < 3600_000) return trendingCache.items;
  const items = await fetchTrending(decryptSecret(s.tmdbKey), s.tmdbLanguage);
  trendingCache = { at: Date.now(), lang: s.tmdbLanguage, items };
  return items;
}
