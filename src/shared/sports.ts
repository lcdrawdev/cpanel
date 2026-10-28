/** Sport categories the app can show (same list as the reference panel's Sports & Leagues). */
export const SPORTS = [
  { id: "football", label: "Futebol" },
  { id: "american_football", label: "Futebol americano" },
  { id: "basketball", label: "Basquete" },
  { id: "baseball", label: "Beisebol" },
  { id: "ice_hockey", label: "Hóquei no gelo" },
  { id: "fighting", label: "Lutas" },
  { id: "motorsport", label: "Automobilismo" },
  { id: "cricket", label: "Críquete" },
  { id: "rugby", label: "Rúgbi" },
  { id: "golf", label: "Golfe" },
  { id: "tennis", label: "Tênis" },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];
export const SPORT_IDS = SPORTS.map((s) => s.id) as [SportId, ...SportId[]];
export const ENTRY_KIND_LABEL = { league: "Liga", country: "País", team: "Time" } as const;
