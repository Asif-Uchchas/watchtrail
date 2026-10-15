import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export type ShowStatus = "watching" | "paused" | "completed" | "dropped";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Personal token for the browser helper (userscript); lets it log episodes without a login cookie. */
  apiToken: text("api_token"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const shows = sqliteTable(
  "shows",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    titleKey: text("title_key").notNull(),
    year: text("year"),
    folderUrl: text("folder_url"),
    /** Any known episode file link, used as a naming template to build other episodes' links. */
    sampleUrl: text("sample_url"),
    posterUrl: text("poster_url"),
    /** TMDB TV id; 0 means "looked up, no match" so we don't keep searching. */
    tmdbId: integer("tmdb_id"),
    /** JSON map of season number → episode count from TMDB, e.g. {"1":22,"2":24}. */
    seasonsJson: text("seasons_json"),
    /** TMDB status, e.g. "Ended" or "Returning Series". */
    airStatus: text("air_status"),
    /** Typical episode length in minutes (TMDB), for watch-time stats. */
    runtime: integer("runtime"),
    /** JSON from TMDB: {"last":{"s":2,"e":3,"date":"..."},"next":{...}} for new-episode alerts. */
    airJson: text("air_json"),
    /** When TMDB data was last refreshed. */
    infoAt: integer("info_at", { mode: "timestamp_ms" }),
    /** 1-5 stars. */
    rating: integer("rating"),
    status: text("status").$type<ShowStatus>().notNull().default("watching"),
    lastSeason: integer("last_season"),
    lastEpisode: integer("last_episode"),
    lastUrl: text("last_url"),
    lastWatchedAt: integer("last_watched_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("shows_user_title").on(t.userId, t.titleKey),
    index("shows_user_updated").on(t.userId, t.updatedAt),
  ],
);

export const episodes = sqliteTable(
  "episodes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    url: text("url"),
    /** Logged in bulk by "mark everything up to here"; kept out of the History feed. */
    backfilled: integer("backfilled", { mode: "boolean" }).notNull().default(false),
    /** Where the user stopped watching (seconds); cleared once finished. */
    resumeSeconds: integer("resume_seconds"),
    watchedAt: integer("watched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("episodes_show_se").on(t.showId, t.season, t.episode),
    index("episodes_user_watched").on(t.userId, t.watchedAt),
  ],
);

export const movies = sqliteTable(
  "movies",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    titleKey: text("title_key").notNull(),
    year: text("year"),
    url: text("url"),
    posterUrl: text("poster_url"),
    watched: integer("watched", { mode: "boolean" }).notNull().default(true),
    rating: integer("rating"),
    resumeSeconds: integer("resume_seconds"),
    watchedAt: integer("watched_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("movies_user_title").on(t.userId, t.titleKey, t.year),
    index("movies_user_watched").on(t.userId, t.watchedAt),
  ],
);

export const links = sqliteTable(
  "links",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    /** The real file link, seen in a folder listing (so Play never has to guess the file name). */
    url: text("url").notNull(),
    seenAt: integer("seen_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("links_show_se").on(t.showId, t.season, t.episode)],
);

export type User = typeof users.$inferSelect;
export type Show = typeof shows.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Movie = typeof movies.$inferSelect;

/**
 * Plain SQL mirror of the tables above. Run once per server start so a fresh
 * install (local file or a new Turso database) works with zero setup steps.
 */
export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    api_token TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS shows (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_key TEXT NOT NULL,
    year TEXT,
    folder_url TEXT,
    sample_url TEXT,
    poster_url TEXT,
    tmdb_id INTEGER,
    seasons_json TEXT,
    air_status TEXT,
    runtime INTEGER,
    status TEXT NOT NULL DEFAULT 'watching',
    last_season INTEGER,
    last_episode INTEGER,
    last_url TEXT,
    last_watched_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS shows_user_title ON shows(user_id, title_key)`,
  `CREATE INDEX IF NOT EXISTS shows_user_updated ON shows(user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    episode INTEGER NOT NULL,
    url TEXT,
    backfilled INTEGER NOT NULL DEFAULT 0,
    watched_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS episodes_show_se ON episodes(show_id, season, episode)`,
  `CREATE INDEX IF NOT EXISTS episodes_user_watched ON episodes(user_id, watched_at)`,
  `CREATE TABLE IF NOT EXISTS movies (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_key TEXT NOT NULL,
    year TEXT,
    url TEXT,
    poster_url TEXT,
    watched INTEGER NOT NULL DEFAULT 1,
    watched_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS movies_user_title ON movies(user_id, title_key, year)`,
  `CREATE INDEX IF NOT EXISTS movies_user_watched ON movies(user_id, watched_at)`,
  `CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    episode INTEGER NOT NULL,
    url TEXT NOT NULL,
    seen_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS links_show_se ON links(show_id, season, episode)`,
];

/**
 * Column additions for databases created by an earlier version. Each runs once;
 * "duplicate column" errors on already-upgraded databases are expected and ignored.
 */
export const MIGRATIONS_SQL = [
  `ALTER TABLE shows ADD COLUMN sample_url TEXT`,
  `ALTER TABLE shows ADD COLUMN tmdb_id INTEGER`,
  `ALTER TABLE shows ADD COLUMN seasons_json TEXT`,
  `ALTER TABLE shows ADD COLUMN air_status TEXT`,
  `ALTER TABLE episodes ADD COLUMN backfilled INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE shows ADD COLUMN runtime INTEGER`,
  `ALTER TABLE users ADD COLUMN api_token TEXT`,
  `ALTER TABLE shows ADD COLUMN air_json TEXT`,
  `ALTER TABLE shows ADD COLUMN info_at INTEGER`,
  `ALTER TABLE shows ADD COLUMN rating INTEGER`,
  `ALTER TABLE episodes ADD COLUMN resume_seconds INTEGER`,
  `ALTER TABLE movies ADD COLUMN rating INTEGER`,
  `ALTER TABLE movies ADD COLUMN resume_seconds INTEGER`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_api_token ON users(api_token)`,
];
