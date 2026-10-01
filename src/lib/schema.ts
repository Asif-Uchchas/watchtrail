import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export type ShowStatus = "watching" | "paused" | "completed" | "dropped";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
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
    posterUrl: text("poster_url"),
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
    watchedAt: integer("watched_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("movies_user_title").on(t.userId, t.titleKey, t.year),
    index("movies_user_watched").on(t.userId, t.watchedAt),
  ],
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
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS shows (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_key TEXT NOT NULL,
    year TEXT,
    folder_url TEXT,
    poster_url TEXT,
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
];
