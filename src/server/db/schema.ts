import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  // SHA-256 of the cookie token; the raw token never touches the database.
  tokenHash: text("token_hash").primaryKey(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const platformEnum = pgEnum("platform", ["android_tv", "android_mobile", "apple", "tizen", "webos", "roku", "other"]);
export const profilePlatformEnum = pgEnum("profile_platform", ["tv", "mobile", "apple"]);
export const deviceStatusEnum = pgEnum("device_status", ["pending", "active", "blocked"]);
export const playlistTypeEnum = pgEnum("playlist_type", ["xtream", "m3u"]);
export const portalTypeEnum = pgEnum("portal_type", ["xtream", "stalker"]);
export const portalModeEnum = pgEnum("portal_mode", ["off", "xtream", "stalker"]);

export const settingsProfiles = pgTable("settings_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  platform: profilePlatformEnum("platform").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const playlists = pgTable("playlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: playlistTypeEnum("type").notNull(),
  url: text("url").notNull(),
  // AES-256-GCM ciphertexts (see server/crypto.ts); null when the type has no credentials.
  usernameEnc: text("username_enc"),
  passwordEnc: text("password_enc"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Device group (reference: Device Groups, MAPA_DE_TELAS 16). The group profile and
 * playlists are copied to every member when the group is saved or a device joins it.
 */
export const deviceGroups = pgTable("device_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  profileId: uuid("profile_id").references(() => settingsProfiles.id, { onDelete: "set null" }),
  playlistIds: jsonb("playlist_ids").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").notNull().unique(),
  nickname: text("nickname").notNull(),
  platform: platformEnum("platform").notNull().default("other"),
  status: deviceStatusEnum("status").notNull().default("pending"),
  profileId: uuid("profile_id").references(() => settingsProfiles.id, { onDelete: "set null" }),
  groupId: uuid("group_id").references(() => deviceGroups.id, { onDelete: "set null" }),
  tokenHash: text("token_hash").unique(),
  configVersion: integer("config_version").notNull().default(1),
  appVersion: text("app_version"),
  model: text("model"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  activatedWithCodeId: uuid("activated_with_code_id"),
  // Participates in the account sync pool (reference: Synchronization, MAPA_DE_TELAS 10–12).
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  // Name of the person using the device, shown on the app's profile (top-right of the home screen).
  customerName: text("customer_name").notNull().default(""),
  // Device-only values on top of the profile (reference: device panel General/Advanced Settings).
  settingsOverrides: jsonb("settings_overrides").$type<Record<string, unknown>>().notNull().default({}),
  // First access from the TV (Ativação do Dispositivo): the TV shows a MAC-style id and a 6-digit code,
  // the customer confirms both on the /ativar page. Only the code's hash is stored.
  mac: text("mac").unique(),
  selfRegistered: boolean("self_registered").notNull().default(false),
  pairingCodeHash: text("pairing_code_hash"),
  pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
  pairingAttempts: integer("pairing_attempts").notNull().default(0),
  // Customer's plan: due date and how many days before (5, 3 or 2) the TV starts warning about it.
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  expiryNoticeDays: integer("expiry_notice_days").notNull().default(5),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Saved device configuration that can be restored on any device (reference: Device snapshots / device-to-device copy). */
export const deviceSnapshots = pgTable("device_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sourceNickname: text("source_nickname").notNull(),
  data: jsonb("data").$type<{ profileId: string | null; playlistIds: string[]; settingsOverrides: Record<string, unknown> }>().notNull(),
  createdAt: createdAt(),
});

export const devicePlaylists = pgTable(
  "device_playlists",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.playlistId] })],
);

export const activationCodes = pgTable("activation_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  maxUses: integer("max_uses").notNull(),
  uses: integer("uses").notNull().default(0),
  profileId: uuid("profile_id").references(() => settingsProfiles.id, { onDelete: "set null" }),
  playlistIds: jsonb("playlist_ids").$type<string[]>().notNull().default([]),
  groupId: uuid("group_id").references(() => deviceGroups.id, { onDelete: "set null" }),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Account-wide policies and maintenance mode (reference: Management Settings and
 * Maintenance Mode, MAPA_DE_TELAS 21–22). Single row with id = 1.
 */
export const accountSettings = pgTable("account_settings", {
  id: integer("id").primaryKey().default(1),
  // Bumped on every change; added to each device version so all apps refetch.
  version: integer("version").notNull().default(1),
  maintenanceEnabled: boolean("maintenance_enabled").notNull().default(false),
  maintenanceMessage: text("maintenance_message").notNull().default(""),
  maintenanceSupportLine: text("maintenance_support_line").notNull().default(""),
  accountNickname: text("account_nickname").notNull().default(""),
  supportUrl: text("support_url").notNull().default(""),
  welcomeMessage: text("welcome_message").notNull().default(""),
  forceUpdates: boolean("force_updates").notNull().default(false),
  disableCloudBackups: boolean("disable_cloud_backups").notNull().default(false),
  channelReportsEnabled: boolean("channel_reports_enabled").notNull().default(true),
  alreadyReportedMessage: text("already_reported_message").notNull().default(""),
  // Pre-defined portal (reference: Pre-Defined Portals, MAPA_DE_TELAS 23–24).
  portalMode: portalModeEnum("portal_mode").notNull().default("off"),
  brandLogoUrl: text("brand_logo_url").notNull().default(""),
  brandHomeLine: text("brand_home_line").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  activationCodeHint: text("activation_code_hint").notNull().default(""),
  // Account sync: master switch, shared data types and the profile shared when settings sync is on.
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  syncPlaylists: boolean("sync_playlists").notNull().default(true),
  syncSettings: boolean("sync_settings").notNull().default(false),
  syncFavorites: boolean("sync_favorites").notNull().default(true),
  syncProfileId: uuid("sync_profile_id").references(() => settingsProfiles.id, { onDelete: "set null" }),
  // Sports visibility (reference: Sports & Leagues, MAPA_DE_TELAS 20).
  sportsEnabled: boolean("sports_enabled").notNull().default(true),
  hiddenSports: jsonb("hidden_sports").$type<string[]>().notNull().default([]),
  hiddenSportEntries: jsonb("hidden_sport_entries").$type<{ sport: string; kind: "league" | "country" | "team"; name: string }[]>().notNull().default([]),
  // E-mail alerts (reference: Account › Notifications).
  notifyEmail: text("notify_email").notNull().default(""),
  notifyDeviceAdded: boolean("notify_device_added").notNull().default(true),
  notifyDeviceRemoved: boolean("notify_device_removed").notNull().default(true),
  notifyChannelReport: boolean("notify_channel_report").notNull().default(true),
  // App appearance (home screen): name, logo (stored as a data URL, served by /api/v1/branding/logo) and menu sections.
  appName: text("app_name").notNull().default(""),
  appLogo: text("app_logo").notNull().default(""),
  homeShowFavorites: boolean("home_show_favorites").notNull().default(true),
  homeShowSport: boolean("home_show_sport").notNull().default(true),
  homeShowTrending: boolean("home_show_trending").notNull().default(true),
  // TMDB key for "Programação em alta" (AES-GCM sealed, like playlist passwords) and its language.
  tmdbKey: text("tmdb_key").notNull().default(""),
  tmdbLanguage: text("tmdb_language").notNull().default("pt-BR"),
  // Words that mark a channel group as sports (Sport section of the app).
  sportsGroupKeywords: jsonb("sports_group_keywords").$type<string[]>().notNull().default(["ESPORTE", "JOGOS DO DIA", "SPORT", "ESPN", "PREMIERE", "COMBATE", "UFC", "F1", "NBA", "NFL"]),
  // Sports data providers (crests, standings, live status); AES-GCM sealed. Empty TheSportsDB key = public free key.
  sportsDbKey: text("sports_db_key").notNull().default(""),
  apiSportsKey: text("api_sports_key").notNull().default(""),
  updatedAt: updatedAt(),
});

/**
 * Images the admin links for the TV catalogue: streaming service logos ("Serviços Inclusos") and covers
 * of the list's series and movie folders ("Grades"). [name] is the service or the folder name as in the list.
 */
export const catalogArtwork = pgTable("catalog_artwork", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"service" | "series" | "movies">().notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

/** Playlists shared with every device in the sync pool. */
export const syncPlaylists = pgTable("sync_playlists", {
  playlistId: uuid("playlist_id")
    .primaryKey()
    .references(() => playlists.id, { onDelete: "cascade" }),
});

/** Live TV favorites shared by the sync pool (added from the panel or from any participating app). */
export const syncFavorites = pgTable("sync_favorites", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelName: text("channel_name").notNull(),
  playlistId: uuid("playlist_id").references(() => playlists.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/** Endpoints the user can pick in pre-defined portal mode; the app asks only for login (XC) or uses the MAC (Stalker). */
export const predefinedPortals = pgTable("predefined_portals", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: portalTypeEnum("type").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: createdAt(),
});

export const reportStatusEnum = pgEnum("report_status", ["open", "resolved"]);

/** Channel problems reported from the app (reference: Channel Reporting, MAPA_DE_TELAS 25). */
export const channelReports = pgTable("channel_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  playlistId: uuid("playlist_id").references(() => playlists.id, { onDelete: "set null" }),
  channelName: text("channel_name").notNull(),
  channelId: text("channel_id"),
  reason: text("reason").notNull(),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Keys for the read-only integration API (reference: Account › Integrations). Only the hash is stored. */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "failed"]);

/** Outbox of e-mail alerts; a mail sender (SMTP) delivers pending ones. */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: notificationStatusEnum("status").notNull().default("pending"),
  createdAt: createdAt(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

/** Messages shown in the app's notification bell, for every device, a group or one device. */
export const deviceMessages = pgTable("device_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  groupId: uuid("group_id").references(() => deviceGroups.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  createdAt: createdAt(),
});

// ---------- Smart TV assistant (docs: "Assistente Inteligente de TV") ----------

export type AssistantTeam = { id: string; name: string; badge: string | null; sport: string | null; league?: string | null; country?: string | null };
export type AssistantSeries = {
  seriesId: string;
  playlistId: string;
  name: string;
  poster: string | null;
  /** Episodes watched before following (auto-follow after 2). */
  watched: number;
  following: boolean;
  /** Episode count the device was last told about; a bigger count on the server = new episode. */
  knownEpisodes: number | null;
};
export type AssistantFinished = { title: string; kind: "movie" | "series"; tmdbId: number | null; year: string | null; at: string };

/** One row per TV: what it likes, built from what it watches. Weights decay by half every 30 days. */
export const assistantProfiles = pgTable("assistant_profiles", {
  deviceId: uuid("device_id").primaryKey().references(() => devices.id, { onDelete: "cascade" }),
  teams: jsonb("teams").$type<AssistantTeam[]>().notNull().default([]),
  series: jsonb("series").$type<AssistantSeries[]>().notNull().default([]),
  genres: jsonb("genres").$type<Record<string, number>>().notNull().default({}),
  kinds: jsonb("kinds").$type<Record<string, number>>().notNull().default({}),
  hours: jsonb("hours").$type<Record<string, number>>().notNull().default({}),
  finished: jsonb("finished").$type<AssistantFinished[]>().notNull().default([]),
  decayedAt: timestamp("decayed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updatedAt(),
});

/** What the TV did with each card: seen, dismissed or accepted, so it is not shown again. */
export const assistantCards = pgTable(
  "assistant_cards",
  {
    deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    status: text("status").notNull(),
    until: timestamp("until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.cardId] })],
);

/** Answers from outside sources shared by every TV (a team's games, a series' episodes, TMDB lookups). */
export const assistantCache = pgTable("assistant_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export type Admin = typeof admins.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type SettingsProfile = typeof settingsProfiles.$inferSelect;
export type ActivationCode = typeof activationCodes.$inferSelect;
export type DeviceGroup = typeof deviceGroups.$inferSelect;
