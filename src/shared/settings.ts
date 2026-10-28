import { z } from "zod";

/**
 * Player settings that a profile pushes to devices. Field set follows the
 * "General/Advanced Settings" groups of the reference panel (MAPA_DE_TELAS 15d/15e);
 * names and labels are our own. Shared by the admin UI and the device API.
 */
export type SettingField =
  | { key: string; label: string; help: string; type: "boolean"; default: boolean }
  | { key: string; label: string; help: string; type: "select"; default: string; options: { value: string; label: string }[] }
  | { key: string; label: string; help: string; type: "number"; default: number; min: number; max: number };

export const SETTING_GROUPS: { id: string; title: string; fields: SettingField[] }[] = [
  {
    id: "geral",
    title: "Geral",
    fields: [
      { key: "language", label: "Idioma do app", help: "Idioma da interface no dispositivo.", type: "select", default: "pt-BR", options: [{ value: "pt-BR", label: "Português (Brasil)" }, { value: "pt-PT", label: "Português (Portugal)" }, { value: "en", label: "English" }, { value: "es", label: "Español" }] },
      { key: "defaultSection", label: "Seção inicial", help: "Tela aberta ao iniciar o app.", type: "select", default: "home", options: [{ value: "home", label: "Início" }, { value: "live", label: "TV ao vivo" }, { value: "movies", label: "Filmes" }, { value: "series", label: "Séries" }] },
      { key: "epgOffsetHours", label: "Ajuste do guia (horas)", help: "Corrige o fuso do guia de programação.", type: "number", default: 0, min: -12, max: 12 },
      { key: "clock24h", label: "Relógio 24 horas", help: "Mostra a hora no formato 24h.", type: "boolean", default: true },
    ],
  },
  {
    id: "reproducao",
    title: "Reprodução",
    fields: [
      { key: "autoFrameRate", label: "Taxa de quadros automática", help: "Ajusta a frequência da tela ao FPS do vídeo (TV).", type: "boolean", default: false },
      { key: "alwaysShowSubtitles", label: "Sempre mostrar legendas", help: "Ativa a primeira legenda disponível.", type: "boolean", default: false },
      { key: "channelInfoTimeoutSec", label: "Tempo do painel de informações (s)", help: "Quanto tempo o painel do canal fica visível.", type: "number", default: 8, min: 3, max: 30 },
      { key: "resumeLastChannel", label: "Abrir no último canal", help: "Ao abrir a TV ao vivo, toca o último canal assistido.", type: "boolean", default: true },
    ],
  },
  {
    id: "restricoes",
    title: "Restrições",
    fields: [
      { key: "lockPlaylistEditing", label: "Bloquear edição de playlists", help: "Impede adicionar, editar ou remover playlists no app.", type: "boolean", default: true },
      { key: "disableExternalPlayers", label: "Bloquear players externos", help: "Impede abrir o conteúdo em outro player.", type: "boolean", default: false },
      { key: "disableRecordings", label: "Desativar gravações e downloads", help: "Remove as funções de gravar e baixar.", type: "boolean", default: false },
      { key: "hidePlaylistInfo", label: "Ocultar dados da playlist", help: "Esconde URL e usuário da playlist no app.", type: "boolean", default: true },
      // "Forçar atualizações" é uma política da conta inteira (server/services/account-settings.ts), não do perfil.
    ],
  },
];

const ALL_FIELDS = SETTING_GROUPS.flatMap((g) => g.fields);

export function defaultSettings(): Record<string, boolean | string | number> {
  return Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.default]));
}

const fieldSchema = (f: SettingField) =>
  f.type === "boolean"
    ? z.boolean()
    : f.type === "number"
      ? z.number().int().min(f.min).max(f.max)
      : z.enum(f.options.map((o) => o.value) as [string, ...string[]]);

export const settingsSchema = z.object(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, fieldSchema(f).optional()])));

/** Reads a settings form (checkboxes absent = false) into validated values. */
export function settingsFromForm(form: FormData) {
  const raw: Record<string, unknown> = {};
  for (const f of ALL_FIELDS) {
    const v = form.get(f.key);
    raw[f.key] = f.type === "boolean" ? v === "on" : f.type === "number" ? Number(v) : String(v ?? f.default);
  }
  return settingsSchema.parse(raw);
}

/** Profile values merged over defaults, so devices always receive every key. */
export function resolveSettings(stored: Record<string, unknown> | null | undefined) {
  return { ...defaultSettings(), ...settingsSchema.parse(stored ?? {}) };
}
