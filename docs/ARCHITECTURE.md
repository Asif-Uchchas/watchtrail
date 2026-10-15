# Architecture

A short tour for contributors. Watchtrail is one Next.js app: server components render pages, server actions do writes, and a few route handlers serve the file hand-off and the browser helper.

```
browser / phone
   |  pages (server components) + server actions
   v
Next.js app  --->  src/lib/library.ts  --->  SQLite file or Turso (Drizzle)
   |                      |
   |                      +--> src/lib/posters.ts  --->  TMDB
   +--> /api/playlist, /api/queue   (.m3u for desktop VLC)
   +--> /api/ext/*                  (userscript + PC bridge, Bearer token)
```

## Key ideas

**Link in, episode out.** `src/lib/parse.ts` turns a pasted file link into `{ show, year, season, episode }` (or a movie, or a folder). It is pure, so the browser uses it for the live preview and the server uses it when saving. It also rebuilds a link for another episode from a known one (`rewriteEpisodeUrl` swaps the `Season N` folder and the `SxxEyy` marker) and rolls into the next season using TMDB season sizes (`episodeAfter` in `library.ts`).

**Real links beat guessed links.** Guessing the next file name breaks when names contain episode titles. The `links` table stores real file links seen in folder listings (sent by the userscript) and in plays. When building a link for an episode, `library.ts` prefers a learned link, then falls back to rewriting a known one. Once a season's listing has been seen, a missing file is treated as missing instead of guessed.

**Handing a link to VLC** (`src/lib/play.ts`):

| Platform | Mechanism |
|---|---|
| Android | `intent://` URL for package `org.videolan.vlc`; start time via the `position` extra |
| iOS / iPadOS | `vlc-x-callback://` URL |
| Desktop | `/api/playlist` returns a one-item `.m3u` (with `#EXTVLCOPT:start-time=N` when resuming) |

`/api/queue` builds a multi-episode `.m3u` the same way.

**Resume.** `episodes.resume_seconds` (and `movies.resume_seconds`) hold the saved position. It is set by the "stopped at" form or by the bridge via `/api/ext/progress`, which matches the reported URL to an episode (or a learned link, or a movie) and logs the episode when it is about 92% done. A saved position older than the latest watched episode is ignored.

**TMDB data** is fetched lazily (`ensureTvInfo`): season sizes, status, runtime and last/next air dates, refreshed about every 12 hours for shows still airing. Without TMDB keys everything degrades gracefully.

## Data model

Defined in `src/lib/schema.ts` (Drizzle) with bootstrap SQL beside it.

| Table | Purpose |
|---|---|
| `users` | account, password hash, personal API token |
| `shows` | one per user and title key; TMDB id, season sizes, air info, status, rating, last-watched pointer |
| `episodes` | one row per watched episode (unique per show/season/episode); URL, watched time, `backfilled`, resume position |
| `movies` | watched or watchlist movies, rating, resume position |
| `links` | real file links per show/season/episode, learned from listings |

There is no migration tool. `SCHEMA_SQL` creates missing tables and `MIGRATIONS_SQL` runs idempotent `ALTER TABLE ... ADD COLUMN` statements on the first request, ignoring "duplicate column" errors. Keep every migration safe to run twice.

## Auth

Session cookies are signed JWTs (`jose`); passwords are hashed with `bcryptjs`. `requireUser()` guards pages and server actions. Route handlers under `/api/ext/*` use `Authorization: Bearer wt_...` instead and resolve the token to a user id (`userIdForToken` in `src/lib/ext.ts`). They send permissive CORS headers because the userscript calls them from the FTP site's origin, so they must only ever act on the token owner's data.

## Folder map

```
src/lib/parse.ts         link parsing and rewriting (pure)
src/lib/library.ts       reads/writes: shows, episodes, movies, history, stats, queue, resume
src/lib/ext.ts           token auth and helpers for the userscript and bridge
src/lib/posters.ts       TMDB lookups (posters, seasons, air dates)
src/lib/schema.ts        tables and migrations
src/lib/play.ts          platform-specific VLC hand-off
src/lib/time.ts          clock formatting and rewind
src/lib/backup.ts        JSON export/import
src/app/actions.ts       server actions
src/app/(app)/           signed-in pages
src/app/(auth)/          sign in / sign up
src/app/api/             playlist, queue, export, ext/*
src/components/          UI (ui.tsx holds the shared styles)
scripts/vlc-bridge.mjs   PC bridge for VLC
scripts/check-parser.ts  prints parser results for sample links
```

## Testing

There is no automated test runner yet. CI runs the type check, lint, the parser smoke script and a production build. A good first contribution is a real test suite for `parse.ts` and `episodeAfter`.
