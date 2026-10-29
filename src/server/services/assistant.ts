import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/create";
import { decryptSecret } from "../crypto";
import { assistantCache, assistantCards, assistantProfiles, type AssistantFinished, type AssistantSeries, type AssistantTeam } from "../db/schema";
import { getAccountSettings } from "./account-settings";
import { playlistsForDevice } from "./playlists";

// ---------- Smart TV assistant ----------
// The TV sends what was watched in small batches and asks for a feed of ready-made cards. Everything that
// comes from outside (a team's games, a series' episodes, TMDB lookups) is cached per team / series / title
// and shared by every TV, so the cost grows with distinct teams and series, not with the number of TVs.
// No background jobs: a cache entry is refreshed when someone asks for it after it expired (fits cPanel).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SPORTSDB = "https://www.thesportsdb.com/api/v1/json";
const IMG = "https://image.tmdb.org/t/p";
const HALF_LIFE_DAYS = 30;

type Device = { id: string };

// ---------- shared cache (memory in front of the database) ----------

const memo = new Map<string, { exp: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Value for [key], loaded at most once per [ttlMs] for all TVs; a failed refresh falls back to the stale value. */
async function shared<T>(db: DbOrTx, key: string, ttlMs: number, load: () => Promise<T>): Promise<T | null> {
  const now = Date.now();
  const mem = memo.get(key);
  if (mem && mem.exp > now) return mem.value as T;
  const row = await db.query.assistantCache.findFirst({ where: eq(assistantCache.key, key) });
  if (row && row.expiresAt.getTime() > now) {
    memo.set(key, { exp: row.expiresAt.getTime(), value: row.value });
    return row.value as T;
  }
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      const value = await load();
      const expiresAt = new Date(Date.now() + ttlMs);
      await db.insert(assistantCache).values({ key, value, expiresAt }).onConflictDoUpdate({ target: assistantCache.key, set: { value, expiresAt } });
      memo.set(key, { exp: expiresAt.getTime(), value });
      return value;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    return await p;
  } catch {
    return (row?.value as T | undefined) ?? null;
  }
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).host}`);
  return res.json();
}

/** Lowercase, no accents, single spaces: how genre and team names are compared. */
export function norm(s: string) {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
}

// ---------- profile ----------

export async function getProfile(db: DbOrTx, device: Device) {
  await db.insert(assistantProfiles).values({ deviceId: device.id }).onConflictDoNothing();
  const p = await db.query.assistantProfiles.findFirst({ where: eq(assistantProfiles.deviceId, device.id) });
  return p!;
}

type Profile = Awaited<ReturnType<typeof getProfile>>;

const GENRE_ALIASES: Record<string, string> = {
  suspense: "thriller", acao: "acao", "acao e aventura": "acao", "action & adventure": "acao", action: "acao", adventure: "aventura",
  comedy: "comedia", horror: "terror", "ficcao cientifica": "ficcao cientifica", "sci fi": "ficcao cientifica", "sci fi fantasy": "ficcao cientifica",
  "sci fi & fantasy": "ficcao cientifica", animation: "animacao", anime: "animacao", desenho: "animacao", documentary: "documentario",
  romance: "romance", romantico: "romance", family: "familia", infantil: "familia", kids: "familia", war: "guerra", western: "faroeste",
  mystery: "misterio", crime: "crime", policial: "crime", fantasy: "fantasia", music: "musica", musical: "musica", history: "historia",
};

/** "Ação, Suspense / Drama" → ["acao", "thriller", "drama"]: one key per genre, as TMDB names them in Portuguese. */
export function genreKeys(labels: string[]) {
  const out = new Set<string>();
  for (const label of labels) {
    for (const part of label.split(/[,/|;]| e |&/)) {
      const k = norm(part);
      if (k.length < 3 || k.length > 30) continue;
      out.add(GENRE_ALIASES[k] ?? k);
    }
  }
  return [...out].slice(0, 6);
}

export const eventsSchema = z.object({
  events: z.array(z.object({
    kind: z.enum(["movie", "series", "live", "sport"]),
    title: z.string().trim().min(1).max(200),
    genres: z.array(z.string().trim().max(60)).max(8).default([]),
    minutes: z.number().min(0).max(600),
    finished: z.boolean().default(false),
    /** Local hour on the TV (0–23) when it was watched. */
    hour: z.number().int().min(0).max(23).optional(),
    at: z.string().max(40).optional(),
    tmdbId: z.number().int().positive().nullable().optional(),
    year: z.string().max(4).nullable().optional(),
    seriesId: z.string().max(40).nullable().optional(),
    playlistId: z.string().max(40).nullable().optional(),
    poster: z.string().max(600).nullable().optional(),
    /** Episodes the TV saw in the series when it was opened (radar baseline). */
    episodes: z.number().int().min(0).max(5000).nullable().optional(),
    /** Answer to "Você gostou?" at the end of a movie: liked genres gain weight, disliked ones lose it. */
    liked: z.boolean().optional(),
  })).max(100),
});

type Taste = Pick<Profile, "genres" | "kinds" | "hours" | "finished" | "series" | "decayedAt">;

const decay = (m: Record<string, number>, f: number) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * f * 10) / 10] as const).filter(([, v]) => v >= 1));

const slot = (h: number) => (h < 6 ? "madrugada" : h < 12 ? "manha" : h < 18 ? "tarde" : "noite");

/**
 * Adds a batch of watching to the taste profile: minutes per genre, kind and time of day, with older weight
 * halved every 30 days; finished titles feed "because you watched"; series watched twice become followed.
 */
export function applyEvents(p: Taste, events: z.infer<typeof eventsSchema>["events"], now = new Date()): Taste {
  const days = (now.getTime() - p.decayedAt.getTime()) / DAY;
  const f = days > 0.5 ? Math.pow(0.5, days / HALF_LIFE_DAYS) : 1;
  const genres = f < 1 ? decay(p.genres, f) : { ...p.genres };
  const kinds = f < 1 ? decay(p.kinds, f) : { ...p.kinds };
  const hours = f < 1 ? decay(p.hours, f) : { ...p.hours };
  let finished = [...p.finished];
  const series = p.series.map((s) => ({ ...s }));
  for (const e of events) {
    if (e.liked != null) {
      for (const g of genreKeys(e.genres)) {
        const w = (genres[g] ?? 0) + (e.liked ? 90 : -60);
        if (w > 0) genres[g] = w; else delete genres[g];
      }
    }
    const m = Math.min(e.minutes, 240);
    if (m < 1) continue;
    for (const g of genreKeys(e.genres)) genres[g] = (genres[g] ?? 0) + m;
    kinds[e.kind] = (kinds[e.kind] ?? 0) + m;
    if (e.hour != null) hours[slot(e.hour)] = (hours[slot(e.hour)] ?? 0) + m;
    if (e.kind === "series" && e.seriesId && e.playlistId) {
      let s = series.find((x) => x.seriesId === e.seriesId && x.playlistId === e.playlistId);
      if (!s) {
        s = { seriesId: e.seriesId, playlistId: e.playlistId, name: e.title, poster: e.poster ?? null, watched: 0, following: false, knownEpisodes: null };
        series.unshift(s);
      }
      if (e.finished) s.watched += 1;
      if (s.watched >= 2) s.following = true;
      if (e.episodes != null) s.knownEpisodes = Math.max(s.knownEpisodes ?? 0, e.episodes);
    }
    if (e.finished && (e.kind === "movie" || e.kind === "series")) {
      const item: AssistantFinished = { title: e.title, kind: e.kind, tmdbId: e.tmdbId ?? null, year: e.year ?? null, at: e.at ?? now.toISOString() };
      finished = [item, ...finished.filter((x) => norm(x.title) !== norm(e.title))].slice(0, 20);
    }
  }
  return { genres, kinds, hours, finished, series: series.slice(0, 40), decayedAt: f < 1 ? now : p.decayedAt };
}

export async function recordEvents(db: DbOrTx, device: Device, input: unknown) {
  const { events } = eventsSchema.parse(input);
  const p = await getProfile(db, device);
  const next = applyEvents(p, events);
  await db.update(assistantProfiles).set({ ...next, updatedAt: new Date() }).where(eq(assistantProfiles.deviceId, device.id));
  return { ok: true, topGenres: topOf(next.genres, 3) };
}

const topOf = (m: Record<string, number>, n: number) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

export const profileSchema = z.object({
  teams: z.array(z.object({ id: z.string().max(20), name: z.string().max(80), badge: z.string().max(400).nullish().transform((x) => x ?? null), sport: z.string().max(40).nullish().transform((x) => x ?? null), league: z.string().max(80).nullable().optional(), country: z.string().max(40).nullable().optional() })).max(1, "Escolha apenas um time.").optional(),
  series: z.array(z.object({ seriesId: z.string().max(40), playlistId: z.string().max(40), name: z.string().max(200), poster: z.string().max(600).nullish().transform((x) => x ?? null), following: z.boolean(), episodes: z.number().int().min(0).nullable().optional(), genres: z.array(z.string().max(60)).max(8).optional() })).max(40).optional(),
});

/** Teams chosen and series followed or unfollowed by the viewer. */
export async function updateProfile(db: DbOrTx, device: Device, input: unknown) {
  const v = profileSchema.parse(input);
  const p = await getProfile(db, device);
  const set: Partial<Profile> = {};
  if (v.teams) {
    // A club picked from the table comes without its provider id: look it up now (or on the next feed if the provider is busy).
    set.teams = await Promise.all(v.teams.map(async (t) => {
      if (t.id) return t satisfies AssistantTeam;
      const r = await resolveTeam(db, t.name, t.country ?? null).catch(() => null);
      return r ? { id: r.id, name: t.name, badge: r.badge, sport: r.sport, league: r.league, country: t.country ?? null } : { ...t, country: t.country ?? null };
    }));
  }
  if (v.series) {
    const series = p.series.map((s) => ({ ...s }));
    const genres = { ...p.genres };
    for (const s of v.series) {
      const cur = series.find((x) => x.seriesId === s.seriesId && x.playlistId === s.playlistId);
      // Marking a series as favourite tells the assistant its genres are liked (worth an hour of watching).
      if (s.following && !cur?.following) for (const g of genreKeys(s.genres ?? [])) genres[g] = (genres[g] ?? 0) + 60;
      if (cur) { cur.following = s.following; if (s.episodes != null) cur.knownEpisodes = Math.max(cur.knownEpisodes ?? 0, s.episodes); }
      else series.unshift({ seriesId: s.seriesId, playlistId: s.playlistId, name: s.name, poster: s.poster, watched: 0, following: s.following, knownEpisodes: s.episodes ?? null });
    }
    set.series = series.slice(0, 40);
    set.genres = genres;
  }
  await db.update(assistantProfiles).set({ ...set, updatedAt: new Date() }).where(eq(assistantProfiles.deviceId, device.id));
  return profileView(await getProfile(db, device));
}

export function profileView(p: Profile) {
  return {
    teams: p.teams,
    series: p.series.filter((s) => s.following).map(({ seriesId, playlistId, name, poster }) => ({ seriesId, playlistId, name, poster })),
    genres: topOf(p.genres, 5),
    kinds: topOf(p.kinds, 4),
    timeOfDay: topOf(p.hours, 1)[0] ?? null,
  };
}

// ---------- sports (TheSportsDB) ----------

// The free TheSportsDB key cannot list a country's clubs (it answers with a fixed sample), so the table of
// teams is kept here: the main clubs of each country. A chosen club gets its TheSportsDB id by name search.
const T = (country: string, name: string, teams: string) => ({ id: country, name, teams: teams.split("|") });

/** Countries and clubs offered in Configurações › Meu time (TheSportsDB country name, label shown on the TV). */
export const TEAM_COUNTRIES = [
  T("Brazil", "Brasil", "América Mineiro|Athletico Paranaense|Atlético Goianiense|Atlético Mineiro|Avaí|Bahia|Botafogo|Ceará|Chapecoense|Corinthians|Coritiba|Criciúma|Cruzeiro|Cuiabá|Flamengo|Fluminense|Fortaleza|Goiás|Grêmio|Guarani|Internacional|Juventude|Mirassol|Náutico|Palmeiras|Paysandu|Ponte Preta|Red Bull Bragantino|Remo|Santos|São Paulo|Sport Recife|Vasco da Gama|Vitória"),
  T("Portugal", "Portugal", "Alverca|Arouca|AVS|Benfica|Boavista|Braga|Casa Pia|Estoril|Estrela da Amadora|Famalicão|Gil Vicente|Marítimo|Moreirense|Nacional|Porto|Rio Ave|Santa Clara|Sporting CP|Tondela|Vitória de Guimarães"),
  T("Argentina", "Argentina", "Argentinos Juniors|Belgrano|Boca Juniors|Estudiantes|Gimnasia La Plata|Godoy Cruz|Huracán|Independiente|Lanús|Newell's Old Boys|Racing Club|River Plate|Rosario Central|San Lorenzo|Talleres|Vélez Sarsfield"),
  T("Spain", "Espanha", "Alavés|Athletic Bilbao|Atlético Madrid|Barcelona|Celta Vigo|Elche|Espanyol|Getafe|Girona|Levante|Mallorca|Osasuna|Rayo Vallecano|Real Betis|Real Madrid|Real Oviedo|Real Sociedad|Sevilla|Valencia|Villarreal"),
  T("England", "Inglaterra", "Arsenal|Aston Villa|Bournemouth|Brentford|Brighton|Burnley|Chelsea|Crystal Palace|Everton|Fulham|Leeds United|Liverpool|Manchester City|Manchester United|Newcastle United|Nottingham Forest|Sunderland|Tottenham Hotspur|West Ham United|Wolverhampton"),
  T("Italy", "Itália", "AC Milan|Atalanta|Bologna|Cagliari|Como|Cremonese|Fiorentina|Genoa|Inter Milan|Juventus|Lazio|Lecce|Napoli|Parma|Pisa|Roma|Sassuolo|Torino|Udinese|Verona"),
  T("Germany", "Alemanha", "Augsburg|Bayer Leverkusen|Bayern Munich|Borussia Dortmund|Borussia Mönchengladbach|Eintracht Frankfurt|FC Köln|Freiburg|Hamburger SV|Heidenheim|Hoffenheim|Mainz|RB Leipzig|St. Pauli|Union Berlin|VfB Stuttgart|Werder Bremen|Wolfsburg"),
  T("France", "França", "Angers|Auxerre|Brest|Le Havre|Lens|Lille|Lorient|Lyon|Marseille|Metz|Monaco|Nantes|Nice|Paris FC|Paris Saint-Germain|Rennes|Strasbourg|Toulouse"),
  T("Netherlands", "Holanda", "Ajax|AZ Alkmaar|Feyenoord|PSV Eindhoven|Twente|Utrecht"),
  T("USA", "Estados Unidos", "Atlanta United|Columbus Crew|Inter Miami|LA Galaxy|Los Angeles FC|New York City FC|New York Red Bulls|Orlando City|Philadelphia Union|Seattle Sounders"),
  T("Mexico", "México", "América|Cruz Azul|Guadalajara|León|Monterrey|Pachuca|Pumas UNAM|Santos Laguna|Tigres UANL|Toluca"),
  T("Uruguay", "Uruguai", "Danubio|Defensor Sporting|Liverpool Montevideo|Nacional Montevideo|Peñarol"),
  T("Colombia", "Colômbia", "América de Cali|Atlético Nacional|Deportivo Cali|Independiente Medellín|Junior|Millonarios|Santa Fe"),
  T("Chile", "Chile", "Colo-Colo|Universidad Católica|Universidad de Chile"),
  T("Paraguay", "Paraguai", "Cerro Porteño|Libertad|Olimpia"),
  T("Saudi Arabia", "Arábia Saudita", "Al Ahli|Al Hilal|Al Ittihad|Al Nassr"),
];

/** Clubs of one country for the picker (TheSportsDB id filled in when one is chosen). */
export function teamsByCountry(country: string) {
  const c = TEAM_COUNTRIES.find((x) => x.id === country);
  if (!c) return [];
  return c.teams.map((name) => ({ id: "", name, badge: null, sport: "Soccer", league: null, country: c.id }));
}

/** TheSportsDB id of a club picked from the table: a football team of that country with that name. */
async function resolveTeam(db: DbOrTx, name: string, country: string | null) {
  const found = (await searchTeams(db, name)).filter((t) => t.sport === "Soccer");
  return found.find((t) => country && t.country === country && norm(t.name) === norm(name))
    ?? found.find((t) => country && t.country === country)
    ?? found.find((t) => norm(t.name) === norm(name))
    ?? found[0] ?? null;
}
async function sportsKey(db: DbOrTx) {
  const s = await getAccountSettings(db);
  return s.sportsDbKey ? decryptSecret(s.sportsDbKey) : "123";
}

type TeamRow = { idTeam: string; strTeam: string; strBadge?: string | null; strSport?: string | null; strLeague?: string | null; strCountry?: string | null };

export async function searchTeams(db: DbOrTx, q: string) {
  const key = norm(q);
  if (key.length < 3) return [];
  const apiKey = await sportsKey(db);
  const rows = await shared(db, `team:${key}`, 7 * DAY, async () => {
    const data = await getJson(`${SPORTSDB}/${apiKey}/searchteams.php?t=${encodeURIComponent(key)}`);
    return ((data?.teams ?? []) as TeamRow[]).slice(0, 10).map((t) => ({
      id: t.idTeam, name: t.strTeam, badge: t.strBadge ? `${t.strBadge}/small` : null, sport: t.strSport ?? null, league: t.strLeague ?? null, country: t.strCountry ?? null,
    }));
  });
  return rows ?? [];
}
type EventRow = { idEvent: string; strTimestamp?: string | null; dateEvent?: string; strTime?: string; strHomeTeam: string; strAwayTeam: string; strLeague?: string | null; strHomeTeamBadge?: string | null; strAwayTeamBadge?: string | null; strThumb?: string | null };
export type NextGame = { id: string; home: string; away: string; league: string | null; startsAt: string; homeBadge: string | null; awayBadge: string | null; image: string | null };

/** Next games of a team, fetched once every 6 hours for every TV that follows it. */
export async function nextGames(db: DbOrTx, teamId: string): Promise<NextGame[]> {
  if (!/^\d+$/.test(teamId)) return [];
  const apiKey = await sportsKey(db);
  const rows = await shared(db, `next:${teamId}`, 6 * HOUR, async () => {
    const data = await getJson(`${SPORTSDB}/${apiKey}/eventsnext.php?id=${teamId}`);
    return ((data?.events ?? []) as EventRow[]).slice(0, 5).map((e) => ({
      id: e.idEvent, home: e.strHomeTeam, away: e.strAwayTeam, league: e.strLeague ?? null,
      // The provider's timestamp is UTC without a zone mark.
      startsAt: new Date(`${(e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? "00:00:00"}`).replace(/Z$|\+00:00$/, "")}Z`).toISOString(),
      homeBadge: e.strHomeTeamBadge ? `${e.strHomeTeamBadge}/small` : null, awayBadge: e.strAwayTeamBadge ? `${e.strAwayTeamBadge}/small` : null, image: e.strThumb ?? null,
    }));
  });
  return (rows ?? []).filter((g) => !Number.isNaN(Date.parse(g.startsAt)));
}

// ---------- series radar (the list's own server) ----------

type Episodes = { count: number; season: number | null; episode: number | null; title: string | null };

async function seriesEpisodes(db: DbOrTx, pl: { url: string; username: string | null; password: string | null }, seriesId: string) {
  if (!pl.username || !pl.password || !/^\d+$/.test(seriesId)) return null;
  const host = new URL(pl.url).host;
  return shared<Episodes>(db, `eps:${host}:${seriesId}`, 12 * HOUR, async () => {
    const api = new URL("player_api.php", pl.url.endsWith("/") ? pl.url : `${pl.url}/`);
    api.search = new URLSearchParams({ username: pl.username!, password: pl.password!, action: "get_series_info", series_id: seriesId }).toString();
    const data = await getJson(api.toString());
    const bySeason = (data?.episodes ?? {}) as Record<string, { episode_num?: number | string; title?: string; season?: number | string }[]>;
    let count = 0;
    let last: { season: number; episode: number; title: string | null } | null = null;
    for (const [season, list] of Object.entries(bySeason)) {
      for (const e of list ?? []) {
        count++;
        const s = Number(e.season ?? season), n = Number(e.episode_num ?? 0);
        if (!last || s > last.season || (s === last.season && n > last.episode)) last = { season: s, episode: n, title: e.title ?? null };
      }
    }
    return { count, season: last?.season ?? null, episode: last?.episode ?? null, title: last?.title ?? null };
  });
}

// ---------- TMDB ----------

type TmdbItem = { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; backdrop_path?: string | null; vote_average?: number; genre_ids?: number[] };
export type Suggestion = { tmdbId: number; type: "movie" | "tv"; title: string; originalTitle: string; year: string | null; poster: string | null; backdrop: string | null; score: number };

async function tmdbSettings(db: DbOrTx) {
  const s = await getAccountSettings(db);
  return s.tmdbKey ? { key: decryptSecret(s.tmdbKey), lang: s.tmdbLanguage } : null;
}

async function tmdb(t: { key: string; lang: string }, path: string, params: Record<string, string> = {}) {
  const bearer = t.key.length > 60;
  const q = new URLSearchParams({ language: t.lang, ...params, ...(bearer ? {} : { api_key: t.key }) });
  return getJson(`https://api.themoviedb.org/3${path}?${q}`, { headers: bearer ? { Authorization: `Bearer ${t.key}` } : {} });
}

const toSuggestion = (r: TmdbItem, type: "movie" | "tv"): Suggestion => ({
  tmdbId: r.id, type,
  title: r.title ?? r.name ?? "", originalTitle: r.original_title ?? r.original_name ?? "",
  year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4) || null,
  poster: r.poster_path ? `${IMG}/w342${r.poster_path}` : null, backdrop: r.backdrop_path ? `${IMG}/w780${r.backdrop_path}` : null,
  score: Math.round((r.vote_average ?? 0) * 10),
});

/** TMDB genre id per normalized Portuguese name (movies and series lists merged). */
async function genreIds(db: DbOrTx, t: { key: string; lang: string }) {
  return (await shared(db, `genres:${t.lang}`, 7 * DAY, async () => {
    const [m, tv] = await Promise.all([tmdb(t, "/genre/movie/list"), tmdb(t, "/genre/tv/list")]);
    const out: Record<string, { movie?: number; tv?: number }> = {};
    for (const g of (m?.genres ?? []) as { id: number; name: string }[]) (out[GENRE_ALIASES[norm(g.name)] ?? norm(g.name)] ??= {}).movie = g.id;
    for (const g of (tv?.genres ?? []) as { id: number; name: string }[]) (out[GENRE_ALIASES[norm(g.name)] ?? norm(g.name)] ??= {}).tv = g.id;
    return out;
  })) ?? {};
}

/** Popular titles of the given genres, shared per genre combination for a day. */
export async function byGenres(db: DbOrTx, keys: string[], type: "movie" | "tv" = "movie"): Promise<Suggestion[]> {
  const t = await tmdbSettings(db);
  if (!t || !keys.length) return [];
  const ids = await genreIds(db, t);
  const wanted = keys.map((k) => ids[k]?.[type]).filter((x): x is number => x != null).slice(0, 2);
  if (!wanted.length) return [];
  return (await shared(db, `disc:${t.lang}:${type}:${wanted.join(",")}`, DAY, async () => {
    const data = await tmdb(t, `/discover/${type}`, { with_genres: wanted.join(","), sort_by: "popularity.desc", "vote_count.gte": "200" });
    return ((data?.results ?? []) as TmdbItem[]).slice(0, 20).map((r) => toSuggestion(r, type));
  })) ?? [];
}

/** TMDB id of a title the TV watched (when the list did not say), by name and year; cached for a month. */
async function resolveTmdb(db: DbOrTx, t: { key: string; lang: string }, f: AssistantFinished) {
  if (f.tmdbId) return f.tmdbId;
  const type = f.kind === "movie" ? "movie" : "tv";
  const title = f.title.replace(/\((19|20)\d{2}\)|\[[^\]]*\]/g, "").trim();
  const year = f.year ?? f.title.match(/\((19|20)\d{2}\)/)?.[0].slice(1, 5) ?? null;
  return shared<number | null>(db, `find:${type}:${norm(title)}:${year ?? ""}`, 30 * DAY, async () => {
    const data = await tmdb(t, `/search/${type}`, { query: title, ...(year ? { [type === "movie" ? "year" : "first_air_date_year"]: year } : {}) });
    return ((data?.results ?? []) as TmdbItem[])[0]?.id ?? null;
  });
}

async function similar(db: DbOrTx, t: { key: string; lang: string }, type: "movie" | "tv", id: number) {
  return (await shared(db, `rec:${t.lang}:${type}:${id}`, DAY, async () => {
    const data = await tmdb(t, `/${type}/${id}/recommendations`);
    return ((data?.results ?? []) as TmdbItem[]).slice(0, 20).map((r) => toSuggestion(r, type));
  })) ?? [];
}

// ---------- feed ----------

export type Card = {
  id: string;
  type: "match" | "episode" | "suggestion";
  priority: number;
  title: string;
  text: string;
  image: string | null;
  action: Record<string, unknown> | null;
  items?: Suggestion[];
  expiresAt?: string;
  /** The TV already showed it as a pop-up (it stays in the list, without popping up again). */
  seen?: boolean;
};

async function matchCards(db: DbOrTx, p: Profile, now: number): Promise<Card[]> {
  const out: Card[] = [];
  for (const team of p.teams.slice(0, 5)) {
    let id = team.id;
    if (!id) {
      id = (await resolveTeam(db, team.name, team.country ?? null).catch(() => null))?.id ?? "";
      if (id) await db.update(assistantProfiles).set({ teams: p.teams.map((t) => (t === team ? { ...t, id } : t)) }).where(eq(assistantProfiles.deviceId, p.deviceId));
    }
    const games = await nextGames(db, id).catch(() => []);
    const g = games.find((x) => Date.parse(x.startsAt) > now - 2 * HOUR);
    if (!g) continue;
    const start = Date.parse(g.startsAt);
    if (start - now > 7 * DAY) continue;
    const soon = start - now < 24 * HOUR;
    out.push({
      id: `m-${g.id}`, type: "match", priority: soon ? 90 : 50,
      title: `${g.home} x ${g.away}`, text: [soon ? "Jogo do seu time hoje" : `Próximo jogo do ${team.name}`, g.league].filter(Boolean).join(" · "),
      image: (team.name === g.home ? g.homeBadge : g.awayBadge) ?? team.badge, expiresAt: new Date(start + 2 * HOUR).toISOString(),
      action: { kind: "remind", at: g.startsAt, teams: [g.home, g.away], team: team.name, homeBadge: g.homeBadge, awayBadge: g.awayBadge },
    });
  }
  return out;
}

async function episodeCards(db: DbOrTx, device: Device, p: Profile): Promise<Card[]> {
  const followed = p.series.filter((s) => s.following).slice(0, 12);
  if (!followed.length) return [];
  const lists = (await playlistsForDevice(db, device.id)).filter((x) => x.type === "xtream");
  const out: Card[] = [];
  const baseline: AssistantSeries[] = [];
  for (const s of followed) {
    const pl = lists.find((x) => x.id === s.playlistId);
    if (!pl) continue;
    const eps = await seriesEpisodes(db, pl, s.seriesId).catch(() => null);
    if (!eps) continue;
    if (s.knownEpisodes == null) { baseline.push({ ...s, knownEpisodes: eps.count }); continue; }
    if (eps.count > s.knownEpisodes) {
      out.push({
        id: `e-${s.seriesId}-${eps.count}`, type: "episode", priority: 70, title: `Novo episódio de ${s.name}`,
        text: eps.season != null && eps.episode != null ? `T${eps.season} E${eps.episode}${eps.title ? ` · ${eps.title}` : ""} já está na sua lista` : "Já está na sua lista",
        image: s.poster, action: { kind: "openSeries", seriesId: s.seriesId, playlistId: s.playlistId, episodes: eps.count },
      });
    }
  }
  // First check of a followed series: remember today's count, so only later episodes count as new.
  if (baseline.length) {
    const series = p.series.map((s) => baseline.find((b) => b.seriesId === s.seriesId && b.playlistId === s.playlistId) ?? s);
    await db.update(assistantProfiles).set({ series }).where(eq(assistantProfiles.deviceId, device.id));
  }
  return out;
}

async function suggestionCards(db: DbOrTx, p: Profile): Promise<Card[]> {
  const t = await tmdbSettings(db);
  if (!t) return [];
  const seen = new Set(p.finished.map((f) => norm(f.title)));
  const fresh = (list: Suggestion[]) => list.filter((s) => !seen.has(norm(s.title)) && !seen.has(norm(s.originalTitle))).slice(0, 12);
  const out: Card[] = [];
  for (const f of p.finished.slice(0, 2)) {
    const id = await resolveTmdb(db, t, f).catch(() => null);
    if (!id) continue;
    const items = fresh(await similar(db, t, f.kind === "movie" ? "movie" : "tv", id).catch(() => []));
    if (items.length) out.push({ id: `r-because-${f.kind}-${id}`, type: "suggestion", priority: 40, title: `Porque você viu ${f.title.replace(/\s*\((19|20)\d{2}\).*$/, "")}`, text: "Parecidos que você pode gostar", image: items[0].backdrop ?? items[0].poster, action: null, items });
  }
  const top = topOf(p.genres, 2);
  if (top.length) {
    const items = fresh(await byGenres(db, top, (p.kinds.series ?? 0) > (p.kinds.movie ?? 0) ? "tv" : "movie").catch(() => []));
    if (items.length) out.push({ id: `r-genres-${top.join("-")}`, type: "suggestion", priority: 30, title: "Separados para você", text: `Pelo que você mais assiste: ${top.map(label).join(" e ")}`, image: items[0].backdrop ?? items[0].poster, action: null, items });
  }
  return out;
}

const LABELS: Record<string, string> = {
  acao: "ação", aventura: "aventura", animacao: "animação", comedia: "comédia", crime: "crime", documentario: "documentário", drama: "drama",
  familia: "família", fantasia: "fantasia", historia: "história", terror: "terror", musica: "música", misterio: "mistério", romance: "romance",
  "ficcao cientifica": "ficção científica", thriller: "suspense", guerra: "guerra", faroeste: "faroeste",
};
const label = (k: string) => LABELS[k] ?? k;

/** Cards for the TV, most important first, without the ones it already closed. */
export async function assistantFeed(db: DbOrTx, device: Device) {
  const now = Date.now();
  const p = await getProfile(db, device);
  const marks = await db.select().from(assistantCards).where(eq(assistantCards.deviceId, device.id));
  const hidden = new Set(marks.filter((m) => m.status !== "snoozed" || (m.until && m.until.getTime() > now)).filter((m) => m.status !== "seen").map((m) => m.cardId));
  const [matches, episodes, suggestions] = await Promise.all([
    matchCards(db, p, now).catch(() => []),
    episodeCards(db, device, p).catch(() => []),
    suggestionCards(db, p).catch(() => []),
  ]);
  const seen = new Set(marks.filter((m) => m.status === "seen").map((m) => m.cardId));
  const cards = [...matches, ...episodes, ...suggestions].filter((c) => !hidden.has(c.id)).map((c) => (seen.has(c.id) ? { ...c, seen: true } : c)).sort((a, b) => b.priority - a.priority);
  return { cards, profile: profileView(p), refreshInSec: 1800 };
}

export const cardSchema = z.object({ status: z.enum(["seen", "dismissed", "done", "snoozed"]), minutes: z.number().int().min(1).max(7 * 24 * 60).optional() });

export async function markCard(db: DbOrTx, device: Device, cardId: string, input: unknown) {
  const v = cardSchema.parse(input);
  const id = cardId.slice(0, 120);
  const until = v.status === "snoozed" ? new Date(Date.now() + (v.minutes ?? 60) * 60_000) : null;
  await db.insert(assistantCards).values({ deviceId: device.id, cardId: id, status: v.status, until })
    .onConflictDoUpdate({ target: [assistantCards.deviceId, assistantCards.cardId], set: { status: v.status, until } });
  // Opening a new episode moves the radar's baseline forward.
  const ep = id.match(/^e-(.+)-(\d+)$/);
  if (ep && v.status === "done") {
    const p = await getProfile(db, device);
    const series = p.series.map((s) => (s.seriesId === ep[1] ? { ...s, knownEpisodes: Math.max(s.knownEpisodes ?? 0, Number(ep[2])) } : s));
    await db.update(assistantProfiles).set({ series }).where(and(eq(assistantProfiles.deviceId, device.id)));
  }
  return { ok: true };
}

// ---------- voice questions (rules, no paid AI) ----------

const GENRE_WORDS: [RegExp, string][] = [
  [/terror|horror|medo/, "terror"], [/comedia|rir|engracad/, "comedia"], [/acao/, "acao"], [/aventura/, "aventura"], [/romance|romantic/, "romance"],
  [/suspense|thriller/, "thriller"], [/drama/, "drama"], [/animacao|desenho|anime|infantil/, "animacao"], [/documentario/, "documentario"],
  [/ficcao|sci fi/, "ficcao cientifica"], [/crime|policial/, "crime"], [/fantasia/, "fantasia"], [/guerra/, "guerra"], [/faroeste|western/, "faroeste"],
  [/familia/, "familia"], [/misterio/, "misterio"],
];

const when = (iso: string, tz: string) => {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day}, ${time}`;
};

export const askSchema = z.object({ text: z.string().trim().min(1).max(200), timeZone: z.string().max(60).optional() });

/**
 * Understands short spoken requests by rules: favourite team, next game, new episodes, recommendations by genre,
 * play a game. Anything else is handed back to the TV as a normal search.
 */
export async function ask(db: DbOrTx, device: Device, input: unknown) {
  const { text, timeZone } = askSchema.parse(input);
  const tz = timeZone && Intl.supportedValuesOf("timeZone").includes(timeZone) ? timeZone : "America/Sao_Paulo";
  const q = norm(text);
  const p = await getProfile(db, device);

  const fav = q.match(/(?:meu time (?:e|eh)|torco (?:pelo|pela|para o|para a|pro|pra|no|na)?|sou torcedor (?:do|da))\s+(.+)/);
  if (fav) {
    const name = fav[1].replace(/^(o|a|do|da|pelo|pela) /, "");
    const found = (await searchTeams(db, name).catch(() => []))[0];
    if (!found) return { intent: "team", answer: `Não achei o time "${name}". Tente falar o nome completo.` };
    // One favourite team per TV: a new one replaces the old.
    const teams = [{ id: found.id, name: found.name, badge: found.badge, sport: found.sport }];
    await db.update(assistantProfiles).set({ teams }).where(eq(assistantProfiles.deviceId, device.id));
    const g = (await nextGames(db, found.id).catch(() => []))[0];
    return { intent: "team", answer: `Pronto, ${found.name} é o seu time.${g ? ` Próximo jogo: ${g.home} x ${g.away}, ${when(g.startsAt, tz)}.` : ""} Vou avisar nos dias de jogo.`, team: found };
  }

  if (/(quando|que horas|qual).*(joga|jogo)|proximo jogo/.test(q)) {
    const named = p.teams.find((t) => q.includes(norm(t.name)));
    const rest = q.replace(/\b(quando|que|horas|qual|e|o|a|proximo|jogo|joga|do|da|vai|hoje)\b/g, " ").replace(/\s+/g, " ").trim();
    const team = named ?? (rest.length >= 3 ? (await searchTeams(db, rest).catch(() => []))[0] : p.teams[0]);
    if (!team) return { intent: "game", answer: "De qual time? Diga, por exemplo: quando joga o Flamengo." };
    const g = (await nextGames(db, team.id).catch(() => []))[0];
    return g
      ? { intent: "game", answer: `${g.home} x ${g.away}, ${when(g.startsAt, tz)}${g.league ? ` (${g.league})` : ""}.`, action: { kind: "remind", at: g.startsAt, teams: [g.home, g.away], team: team.name } }
      : { intent: "game", answer: `Não encontrei o próximo jogo do ${team.name}.` };
  }

  if (/(coloca|bota|abre|liga|assistir|ver|passa).*jogo/.test(q)) {
    const team = p.teams.find((t) => q.includes(norm(t.name)));
    const words = q.replace(/\b(coloca|bota|abre|liga|assistir|ver|passa|o|a|jogo|do|da|no|na|canal|pra|para|eu|quero)\b/g, " ").replace(/\s+/g, " ").trim();
    return { intent: "playGame", answer: "Procurando o jogo nos canais de hoje…", action: { kind: "playGame", team: team?.name ?? (words || null) } };
  }

  if (/(episodio|capitulo).*novo|novo.*(episodio|capitulo)|lancou|saiu.*(episodio|temporada)/.test(q)) {
    const cards = await episodeCards(db, device, p).catch(() => []);
    return { intent: "episodes", answer: cards.length ? `Tem novidade em ${cards.map((c) => c.title.replace("Novo episódio de ", "")).join(", ")}.` : "Nenhum episódio novo nas séries que você acompanha.", cards };
  }

  if (/recomend|sugir|sugest|indica|o que (eu )?(assisto|assistir|ver)|algum (filme|serie)|um (filme|serie)/.test(q)) {
    const genre = GENRE_WORDS.find(([re]) => re.test(q))?.[1];
    const type = /serie/.test(q) ? "tv" : "movie";
    const keys = genre ? [genre] : topOf(p.genres, 2);
    const items = (await byGenres(db, keys, type).catch(() => [])).slice(0, 12);
    if (!items.length) return { intent: "recommend", answer: "Ainda não tenho sugestões: assista mais um pouco que eu aprendo o seu gosto." };
    const what = type === "tv" ? "séries" : "filmes";
    return {
      intent: "recommend", answer: genre ? `Separei ${what} de ${label(genre)}.` : `Pelo que você assiste, separei ${what} de ${keys.map(label).join(" e ")}.`,
      cards: [{ id: `r-ask-${type}-${keys.join("-")}`, type: "suggestion", priority: 60, title: "Sugestões para você", text: "", image: items[0].backdrop ?? items[0].poster, action: null, items } satisfies Card],
    };
  }

  return { intent: "search", answer: `Procurando "${text}"…`, action: { kind: "search", query: text } };
}
