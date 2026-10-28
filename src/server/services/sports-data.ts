import type { DbOrTx } from "../db/create";
import { decryptSecret, encryptSecret } from "../crypto";
import { getAccountSettings, save } from "./account-settings";
import { ServiceError } from "./errors";
import { audit } from "./audit";

// ---------- Sports data (TheSportsDB): team crests, league badges and standings ----------
// The panel calls the provider once and caches, and every TV reads from the panel: the key stays here
// and one lookup serves all devices. Without a key the provider's public free key is used.

const SPORTSDB = "https://www.thesportsdb.com/api/v1/json";
const FREE_KEY = "123";
const DAY = 24 * 3_600_000;

/** Leagues offered under "Classificação" (TheSportsDB ids, checked 2026-10-28). */
export const STANDINGS_LEAGUES = [
  { id: "4351", name: "Brasileirão Série A" },
  { id: "4404", name: "Brasileirão Série B" },
  { id: "4344", name: "Liga Portugal" },
  { id: "4328", name: "Premier League" },
  { id: "4335", name: "LaLiga" },
  { id: "4332", name: "Serie A" },
  { id: "4331", name: "Bundesliga" },
  { id: "4334", name: "Ligue 1" },
] as const;

type Entry<T> = { at: number; value: T };
const cache = new Map<string, Entry<unknown>>();
/** Names waiting for a lookup, filled slowly in the background (the free key allows ~30 calls a minute). */
const pending = new Set<string>();
let filling = false;

async function sportsDbKey(db: DbOrTx) {
  const s = await getAccountSettings(db);
  return s.sportsDbKey ? decryptSecret(s.sportsDbKey) : FREE_KEY;
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (res.status === 429) throw new ServiceError("sports_rate_limited", "Limite de consultas do TheSportsDB atingido; tente em um minuto.", 503);
  if (!res.ok) throw new ServiceError("sports_unavailable", `TheSportsDB respondeu HTTP ${res.status}.`, 502);
  return res.json();
}

/** Team name as the lists write it, reduced to what TheSportsDB searches well. */
export function teamKey(name: string) {
  return name.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/\b(fc|cf|sc|ec|ac|afc|club|clube|de|futebol)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

type TeamRow = { strTeam?: string; strTeamAlternate?: string; strBadge?: string | null; strSport?: string };

async function lookupBadge(key: string, apiKey: string): Promise<string | null> {
  const tries = [...new Set([key, key.split(" ").slice(0, 2).join(" ")])].filter((t) => t.length >= 3);
  for (const t of tries) {
    const data = await getJson(`${SPORTSDB}/${apiKey}/searchteams.php?t=${encodeURIComponent(t)}`);
    const teams = (data?.teams ?? []) as TeamRow[];
    const best = teams.find((x) => teamKey(x.strTeam ?? "") === key) ?? teams.find((x) => x.strBadge) ?? null;
    if (best?.strBadge) return `${best.strBadge}/small`;
  }
  return null;
}

/**
 * Crests for the given team names. Known ones come from the cache right away; unknown ones are looked up
 * in the background, so the app asks again a little later and the crests appear as they arrive.
 */
export async function teamBadges(db: DbOrTx, names: string[]) {
  const apiKey = await sportsDbKey(db);
  const out: Record<string, string | null> = {};
  for (const name of names.slice(0, 120)) {
    const key = teamKey(name);
    if (!key) continue;
    const hit = cache.get(`badge:${key}`) as Entry<string | null> | undefined;
    if (hit && Date.now() - hit.at < 7 * DAY) out[name] = hit.value;
    else pending.add(key);
  }
  if (pending.size && !filling) void fillPending(apiKey);
  return { badges: out, pending: names.filter((n) => !(n in out)).length };
}

async function fillPending(apiKey: string) {
  filling = true;
  try {
    while (pending.size) {
      const key = pending.values().next().value as string;
      pending.delete(key);
      try {
        cache.set(`badge:${key}`, { at: Date.now(), value: await lookupBadge(key, apiKey) });
      } catch (e) {
        if (e instanceof ServiceError && e.code === "sports_rate_limited") { pending.add(key); await new Promise((r) => setTimeout(r, 60_000)); }
      }
      await new Promise((r) => setTimeout(r, 2_100)); // ~28 calls a minute, under the free limit
    }
  } finally {
    filling = false;
  }
}

type TableRow = {
  intRank: string; strTeam: string; strBadge?: string | null; intPlayed: string; intWin: string; intDraw: string; intLoss: string;
  intGoalsFor: string; intGoalsAgainst: string; intGoalDifference: string; intPoints: string; strForm?: string | null; strDescription?: string | null;
};

/** Standings of one league in its current season (free key: the top rows only; a paid key brings the whole table). */
export async function standings(db: DbOrTx, leagueId: string) {
  const league = STANDINGS_LEAGUES.find((l) => l.id === leagueId);
  if (!league) throw new ServiceError("not_found", "Campeonato não disponível.", 404);
  const apiKey = await sportsDbKey(db);
  const info = await cached(`league:${leagueId}`, DAY, async () => {
    const l = (await getJson(`${SPORTSDB}/${apiKey}/lookupleague.php?id=${leagueId}`))?.leagues?.[0];
    return { season: (l?.strCurrentSeason as string) ?? "", badge: (l?.strBadge as string | null) ?? null };
  });
  const rows = await cached(`table:${leagueId}:${info.season}`, 30 * 60_000, async () => {
    const data = await getJson(`${SPORTSDB}/${apiKey}/lookuptable.php?l=${leagueId}&s=${encodeURIComponent(info.season)}`);
    return ((data?.table ?? []) as TableRow[]).map((r) => ({
      rank: Number(r.intRank), team: r.strTeam, badge: r.strBadge ?? null,
      played: Number(r.intPlayed), won: Number(r.intWin), drawn: Number(r.intDraw), lost: Number(r.intLoss),
      goalsFor: Number(r.intGoalsFor), goalsAgainst: Number(r.intGoalsAgainst), goalDiff: Number(r.intGoalDifference),
      points: Number(r.intPoints), form: r.strForm ?? null, zone: r.strDescription ?? null,
    }));
  });
  return { id: league.id, name: league.name, season: info.season, badge: info.badge, rows, partial: apiKey === FREE_KEY };
}

// ---------- Live football (API-Sports): score, minute, real status and official crests ----------
// One call brings every fixture of the day; it is cached for 15 minutes, so a day costs ~96 of the
// free plan's 100 calls. A paid plan can lower FOOTBALL_REFRESH_MS for a near-live score.

const API_FOOTBALL = "https://v3.football.api-sports.io";
const FOOTBALL_REFRESH_MS = 15 * 60_000;
/** Calendar of the lists' "Jogos do dia" (Brazilian provider). */
const LIST_ZONE = "America/Sao_Paulo";

export type LiveFixture = {
  home: string; away: string; homeLogo: string | null; awayLogo: string | null;
  league: string; leagueLogo: string | null; startMs: number;
  state: "upcoming" | "live" | "ended" | "postponed"; statusShort: string; elapsed: number | null;
  goalsHome: number | null; goalsAway: number | null;
};

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
const ENDED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const POSTPONED = new Set(["PST", "CANC", "ABD"]);

export function fixtureState(short: string): LiveFixture["state"] {
  if (LIVE.has(short)) return "live";
  if (ENDED.has(short)) return "ended";
  if (POSTPONED.has(short)) return "postponed";
  return "upcoming";
}

type ApiFixture = {
  fixture: { timestamp: number; status: { short: string; elapsed: number | null } };
  league: { name: string; logo?: string | null };
  teams: { home: { name: string; logo?: string | null }; away: { name: string; logo?: string | null } };
  goals: { home: number | null; away: number | null };
};

function todayInListZone(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LIST_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function footballDay(db: DbOrTx): Promise<LiveFixture[]> {
  const s = await getAccountSettings(db);
  if (!s.apiSportsKey) return [];
  const key = decryptSecret(s.apiSportsKey);
  const date = todayInListZone();
  return cached(`football:${date}`, FOOTBALL_REFRESH_MS, async () => {
    const res = await fetch(`${API_FOOTBALL}/fixtures?date=${date}&timezone=${encodeURIComponent(LIST_ZONE)}`, {
      headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(20_000), cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    // API-Sports answers 200 with an "errors" object when the key or the quota is the problem.
    const errors = data?.errors && (Array.isArray(data.errors) ? data.errors : Object.values(data.errors));
    if (!res.ok || !data || (errors && errors.length)) {
      console.warn("api-sports football:", res.status, JSON.stringify(data?.errors ?? null));
      return [];
    }
    return ((data.response ?? []) as ApiFixture[]).map((f) => ({
      home: f.teams.home.name, away: f.teams.away.name,
      homeLogo: f.teams.home.logo ?? null, awayLogo: f.teams.away.logo ?? null,
      league: f.league.name, leagueLogo: f.league.logo ?? null,
      startMs: f.fixture.timestamp * 1000,
      state: fixtureState(f.fixture.status.short), statusShort: f.fixture.status.short, elapsed: f.fixture.status.elapsed,
      goalsHome: f.goals.home, goalsAway: f.goals.away,
    }));
  });
}

/** Same team? Equal reduced names, one inside the other ("Inter" / "Inter Milan"), or most words shared. */
export function sameTeam(a: string, b: string) {
  const x = teamKey(a), y = teamKey(b);
  if (!x || !y) return false;
  if (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return true;
  const wx = new Set(x.split(" ")), wy = new Set(y.split(" "));
  const common = [...wx].filter((w) => w.length >= 3 && wy.has(w)).length;
  return common > 0 && common >= Math.min(wx.size, wy.size) * 0.6;
}

/** Live data for the list's matches ("Home~Away" keys); a match not found in today's fixtures maps to null. */
export async function liveMatches(db: DbOrTx, pairs: string[]) {
  const day = await footballDay(db);
  // `swapped`: the list wrote the teams the other way round, so the app flips crests and goals.
  const out: Record<string, (LiveFixture & { swapped: boolean }) | null> = {};
  for (const pair of pairs.slice(0, 150)) {
    const [home, away] = pair.split("~");
    if (!home || !away) continue;
    const same = day.find((f) => sameTeam(home, f.home) && sameTeam(away, f.away));
    const flipped = same ? undefined : day.find((f) => sameTeam(home, f.away) && sameTeam(away, f.home));
    out[pair] = same ? { ...same, swapped: false } : flipped ? { ...flipped, swapped: true } : null;
  }
  return { matches: out, enabled: day.length > 0 };
}

// ---------- Keys (panel › Esportes) ----------

export async function sportsDataStatus(db: DbOrTx) {
  const s = await getAccountSettings(db);
  return { sportsDbOwnKey: !!s.sportsDbKey, apiSportsKey: !!s.apiSportsKey };
}

/** Saves the provider keys; an empty field keeps the current one. TheSportsDB's key is checked before saving. */
export async function updateSportsDataKeys(db: DbOrTx, actor: string, input: { sportsDbKey: string; removeSportsDbKey: boolean; apiSportsKey: string; removeApiSportsKey: boolean }) {
  const values: Record<string, string> = {};
  if (input.removeSportsDbKey) values.sportsDbKey = "";
  else if (input.sportsDbKey.trim()) {
    const key = input.sportsDbKey.trim();
    const ok = await getJson(`${SPORTSDB}/${encodeURIComponent(key)}/lookupleague.php?id=4351`).catch(() => null);
    if (!ok?.leagues?.length) throw new ServiceError("invalid", "O TheSportsDB não aceitou essa chave. Confira e tente de novo.");
    values.sportsDbKey = encryptSecret(key);
  }
  if (input.removeApiSportsKey) values.apiSportsKey = "";
  else if (input.apiSportsKey.trim()) values.apiSportsKey = encryptSecret(input.apiSportsKey.trim());
  await getAccountSettings(db);
  await save(db, values);
  cache.clear();
  await audit(db, actor, "sports_data.keys_updated");
}
