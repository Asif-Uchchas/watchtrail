import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, ready } from "./db";
import { episodes, movies, shows, type Movie, type Show } from "./schema";
import { findPoster, findTvInfo, postersEnabled } from "./posters";
import { formatEpisode, guessNextEpisodeUrl, normalizeKey, parentFolderUrl, rewriteEpisodeUrl } from "./parse";

const now = () => new Date();
const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------- season data

export type SeasonMap = Record<number, number>;

export function parseSeasons(show: Pick<Show, "seasonsJson">): SeasonMap | null {
  if (!show.seasonsJson) return null;
  try {
    const raw = JSON.parse(show.seasonsJson) as Record<string, number>;
    const map: SeasonMap = {};
    for (const [k, v] of Object.entries(raw)) if (Number(k) > 0 && v > 0) map[Number(k)] = v;
    return Object.keys(map).length ? map : null;
  } catch {
    return null;
  }
}

/**
 * The episode after (season, episode). With TMDB season sizes this rolls over
 * into the next season and returns null once the show is fully watched; without
 * them it just adds one to the episode number.
 */
export function episodeAfter(
  seasons: SeasonMap | null,
  season: number,
  episode: number,
): { season: number; episode: number } | null {
  if (!seasons || !seasons[season]) return { season, episode: episode + 1 };
  if (episode < seasons[season]) return { season, episode: episode + 1 };
  const later = Object.keys(seasons)
    .map(Number)
    .filter((s) => s > season)
    .sort((a, b) => a - b);
  return later.length ? { season: later[0], episode: 1 } : null;
}

/** Fetch TMDB id, poster and season sizes once per show (no-op without a TMDB key). */
async function ensureTvInfo(show: Show): Promise<Show> {
  if (show.tmdbId !== null || !postersEnabled()) return show;
  const info = await findTvInfo(show.title, show.year);
  const patch: Partial<Show> = {
    tmdbId: info?.tmdbId ?? 0,
    seasonsJson: info ? JSON.stringify(info.seasons) : null,
    airStatus: info?.status ?? null,
  };
  if (!show.posterUrl && info?.posterUrl) patch.posterUrl = info.posterUrl;
  await db.update(shows).set(patch).where(eq(shows.id, show.id));
  return { ...show, ...patch };
}

/** Re-fetch season sizes (new episodes air, or the first match was wrong). */
export async function refreshTvInfo(userId: string, showId: string): Promise<Show | null> {
  const show = await getShow(userId, showId);
  if (!show) return null;
  const info = await findTvInfo(show.title, show.year, show.tmdbId);
  if (!info) return show;
  const patch: Partial<Show> = {
    tmdbId: info.tmdbId,
    seasonsJson: JSON.stringify(info.seasons),
    airStatus: info.status,
    posterUrl: show.posterUrl ?? info.posterUrl,
  };
  await db.update(shows).set(patch).where(eq(shows.id, show.id));
  return { ...show, ...patch };
}

// ---------------------------------------------------------------- shows

export async function upsertShow(
  userId: string,
  input: { title: string; year: string | null; folderUrl: string | null; sampleUrl?: string | null },
): Promise<{ show: Show; created: boolean }> {
  await ready();
  const titleKey = normalizeKey(input.title);
  const existing = await db
    .select()
    .from(shows)
    .where(and(eq(shows.userId, userId), eq(shows.titleKey, titleKey)))
    .get();

  if (existing) {
    const patch: Partial<Show> = {};
    if (!existing.folderUrl && input.folderUrl) patch.folderUrl = input.folderUrl;
    if (!existing.year && input.year) patch.year = input.year;
    // Keep the most recent episode link as the naming template.
    if (input.sampleUrl && input.sampleUrl !== existing.sampleUrl) patch.sampleUrl = input.sampleUrl;
    if (Object.keys(patch).length) await db.update(shows).set(patch).where(eq(shows.id, existing.id));
    return { show: await ensureTvInfo({ ...existing, ...patch }), created: false };
  }

  const info = await findTvInfo(input.title, input.year);
  const row: Show = {
    id: newId(),
    userId,
    title: input.title,
    titleKey,
    year: input.year,
    folderUrl: input.folderUrl,
    sampleUrl: input.sampleUrl ?? null,
    posterUrl: info?.posterUrl ?? null,
    tmdbId: postersEnabled() ? (info?.tmdbId ?? 0) : null,
    seasonsJson: info ? JSON.stringify(info.seasons) : null,
    airStatus: info?.status ?? null,
    status: "watching",
    lastSeason: null,
    lastEpisode: null,
    lastUrl: null,
    lastWatchedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(shows).values(row);
  return { show: row, created: true };
}

export async function getShow(userId: string, showId: string): Promise<Show | undefined> {
  await ready();
  return db
    .select()
    .from(shows)
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)))
    .get();
}

/** Re-derive a show's "last watched" pointer from its episode log. */
async function recomputeProgress(showId: string) {
  const latest = await db
    .select()
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .orderBy(desc(episodes.season), desc(episodes.episode))
    .get();
  const lastActivity = await db
    .select({ at: sql<number | null>`max(${episodes.watchedAt})` })
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .get();

  await db
    .update(shows)
    .set({
      lastSeason: latest?.season ?? null,
      lastEpisode: latest?.episode ?? null,
      lastUrl: latest?.url ?? null,
      lastWatchedAt: lastActivity?.at ? new Date(lastActivity.at) : null,
      updatedAt: now(),
    })
    .where(eq(shows.id, showId));
}

/** Any real episode link for this show, to use as a naming template. */
async function referenceUrl(showId: string, preferSeason?: number): Promise<string | null> {
  const refs = await db
    .select({ season: episodes.season, url: episodes.url })
    .from(episodes)
    .where(and(eq(episodes.showId, showId), sql`${episodes.url} is not null`))
    .orderBy(desc(episodes.watchedAt))
    .limit(20);
  // Prefer a reference from the same season: its folder name is certainly right.
  const sameSeason = preferSeason !== undefined ? refs.find((r) => r.season === preferSeason) : undefined;
  if (sameSeason?.url) return sameSeason.url;
  if (refs[0]?.url) return refs[0].url;
  const show = await db.select({ sampleUrl: shows.sampleUrl }).from(shows).where(eq(shows.id, showId)).get();
  return show?.sampleUrl ?? null;
}

/** Build a link for an episode logged by number, from any other episode we have a link for. */
async function deriveEpisodeUrl(showId: string, season: number, episode: number): Promise<string | null> {
  const ref = await referenceUrl(showId, season);
  return ref ? rewriteEpisodeUrl(ref, season, episode) : null;
}

/** Store an episode link as the show's naming template and fill in links for episodes logged by number. */
export async function setSampleUrl(userId: string, showId: string, url: string) {
  await ready();
  await db
    .update(shows)
    .set({ sampleUrl: url, updatedAt: now() })
    .where(and(eq(shows.id, showId), eq(shows.userId, userId)));
  const missing = await db
    .select({ id: episodes.id, season: episodes.season, episode: episodes.episode })
    .from(episodes)
    .where(and(eq(episodes.showId, showId), eq(episodes.userId, userId), sql`${episodes.url} is null`));
  for (const ep of missing) {
    const derived = rewriteEpisodeUrl(url, ep.season, ep.episode);
    if (derived) await db.update(episodes).set({ url: derived }).where(eq(episodes.id, ep.id));
  }
  await recomputeProgress(showId);
}

export async function recordEpisode(
  userId: string,
  showId: string,
  season: number,
  episode: number,
  url: string | null,
): Promise<{ episodeId: string; alreadyWatched: boolean }> {
  await ready();
  if (!url) url = await deriveEpisodeUrl(showId, season, episode);
  const existing = await db
    .select({ id: episodes.id, url: episodes.url })
    .from(episodes)
    .where(and(eq(episodes.showId, showId), eq(episodes.season, season), eq(episodes.episode, episode)))
    .get();

  if (existing) {
    await db
      .update(episodes)
      .set({ watchedAt: now(), url: url ?? existing.url, backfilled: false })
      .where(eq(episodes.id, existing.id));
  } else {
    await db.insert(episodes).values({
      id: newId(),
      userId,
      showId,
      season,
      episode,
      url,
      backfilled: false,
      watchedAt: now(),
    });
  }

  // Watching an episode of a paused/finished show puts it back in rotation.
  await db
    .update(shows)
    .set({ status: "watching" })
    .where(and(eq(shows.id, showId), sql`${shows.status} != 'watching'`));
  await recomputeProgress(showId);

  const row = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.showId, showId), eq(episodes.season, season), eq(episodes.episode, episode)))
    .get();
  return { episodeId: row!.id, alreadyWatched: Boolean(existing) };
}

/**
 * Log (season, episode) and every episode before it. Earlier seasons are filled
 * using TMDB's episode counts; seasons with unknown size are skipped and
 * reported back so the UI can say so.
 */
export async function markUpTo(
  userId: string,
  showId: string,
  season: number,
  episode: number,
): Promise<{ added: number; skippedSeasons: number[]; episodeId: string } | null> {
  await ready();
  const found = await getShow(userId, showId);
  if (!found) return null;
  const show = await ensureTvInfo(found);
  const seasons = parseSeasons(show);

  const wanted: [number, number][] = [];
  const skippedSeasons: number[] = [];
  for (let s = 1; s < season; s++) {
    const count = seasons?.[s];
    if (!count) {
      skippedSeasons.push(s);
      continue;
    }
    for (let e = 1; e <= count; e++) wanted.push([s, e]);
  }
  for (let e = 1; e < episode; e++) wanted.push([season, e]);

  const have = new Set(
    (
      await db
        .select({ season: episodes.season, episode: episodes.episode })
        .from(episodes)
        .where(eq(episodes.showId, showId))
    ).map((r) => `${r.season}:${r.episode}`),
  );
  const missing = wanted.filter(([s, e]) => !have.has(`${s}:${e}`));

  const ref = await referenceUrl(showId);
  // Stamp backfilled episodes just before "now", in order, so sorting by time still works.
  const base = Date.now() - 60_000 - missing.length;
  const rows = missing.map(([s, e], i) => ({
    id: newId(),
    userId,
    showId,
    season: s,
    episode: e,
    url: ref ? rewriteEpisodeUrl(ref, s, e) : null,
    backfilled: true,
    watchedAt: new Date(base + i),
  }));
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(episodes).values(rows.slice(i, i + 100)).onConflictDoNothing();
  }

  const { episodeId } = await recordEpisode(userId, showId, season, episode, null);
  return { added: rows.length, skippedSeasons, episodeId };
}

export async function removeEpisode(userId: string, episodeId: string) {
  await ready();
  const row = await db
    .select({ showId: episodes.showId })
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.userId, userId)))
    .get();
  if (!row) return;
  await db.delete(episodes).where(eq(episodes.id, episodeId));
  await recomputeProgress(row.showId);
}

/** Remove every episode of one season from the log. */
export async function clearSeason(userId: string, showId: string, season: number) {
  await ready();
  await db
    .delete(episodes)
    .where(and(eq(episodes.showId, showId), eq(episodes.userId, userId), eq(episodes.season, season)));
  await recomputeProgress(showId);
}

export async function updateShow(
  userId: string,
  showId: string,
  patch: Partial<Pick<Show, "title" | "folderUrl" | "status" | "year">>,
) {
  await ready();
  const set: Partial<Show> = { ...patch, updatedAt: now() };
  if (patch.title) {
    set.titleKey = normalizeKey(patch.title);
    // A new title may match a different TMDB entry; look it up again.
    set.tmdbId = null;
    set.seasonsJson = null;
  }
  await db.update(shows).set(set).where(and(eq(shows.id, showId), eq(shows.userId, userId)));
}

export async function deleteShow(userId: string, showId: string) {
  await ready();
  await db.delete(episodes).where(and(eq(episodes.showId, showId), eq(episodes.userId, userId)));
  await db.delete(shows).where(and(eq(shows.id, showId), eq(shows.userId, userId)));
}

export type ShowCard = Show & {
  /** Next episode to watch; null when the whole show is watched (needs TMDB data). */
  nextSeason: number | null;
  nextEpisode: number | null;
  nextLabel: string | null;
  nextUrl: string | null;
  seasonFolderUrl: string | null;
  caughtUp: boolean;
  watchedCount: number;
  totalEpisodes: number | null;
  seasonCount: number | null;
};

function toCard(show: Show, watchedCount: number): ShowCard {
  const seasons = parseSeasons(show);
  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  const next = hasProgress
    ? episodeAfter(seasons, show.lastSeason!, show.lastEpisode!)
    : { season: 1, episode: 1 };

  let nextUrl: string | null = null;
  if (next) {
    // Rebuild from the last watched file (or the show's example link); this also
    // handles moving to the next season's folder.
    const base = show.lastUrl ?? show.sampleUrl;
    nextUrl = base ? rewriteEpisodeUrl(base, next.season, next.episode) : null;
    if (!nextUrl && show.lastUrl && next.season === show.lastSeason) nextUrl = guessNextEpisodeUrl(show.lastUrl);
  }

  const totalEpisodes = seasons ? Object.values(seasons).reduce((a, b) => a + b, 0) : null;
  return {
    ...show,
    watchedCount,
    nextSeason: next?.season ?? null,
    nextEpisode: next?.episode ?? null,
    nextLabel: next ? formatEpisode(next.season, next.episode) : null,
    nextUrl,
    seasonFolderUrl: nextUrl
      ? parentFolderUrl(nextUrl)
      : show.lastUrl
        ? parentFolderUrl(show.lastUrl)
        : show.folderUrl,
    caughtUp: hasProgress && next === null,
    totalEpisodes,
    seasonCount: seasons ? Object.keys(seasons).length : null,
  };
}

export async function listShows(userId: string): Promise<ShowCard[]> {
  await ready();
  const rows = await db
    .select({
      show: shows,
      // Fully qualified on purpose: Drizzle drops table prefixes in single-table
      // selects, which would make the subquery compare episodes with themselves.
      watchedCount: sql<number>`(select count(*) from episodes e where e.show_id = "shows"."id")`,
    })
    .from(shows)
    .where(eq(shows.userId, userId))
    .orderBy(desc(sql`coalesce(${shows.lastWatchedAt}, ${shows.createdAt})`));
  // Shows added before TMDB was set up get their season data on first view.
  const enriched = await Promise.all(rows.map((r) => ensureTvInfo(r.show)));
  return enriched.map((show, i) => toCard(show, Number(rows[i].watchedCount)));
}

export async function getShowDetail(userId: string, showId: string) {
  const found = await getShow(userId, showId);
  if (!found) return null;
  const show = await ensureTvInfo(found);
  const log = await db
    .select()
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .orderBy(asc(episodes.season), asc(episodes.episode));
  return { show: toCard(show, log.length), episodes: log, seasons: parseSeasons(show) };
}

// ---------------------------------------------------------------- movies

export async function upsertMovie(
  userId: string,
  input: { title: string; year: string | null; url: string | null; watched: boolean },
): Promise<{ movie: Movie; created: boolean }> {
  await ready();
  const titleKey = normalizeKey(input.title);
  const existing = await db
    .select()
    .from(movies)
    .where(
      and(
        eq(movies.userId, userId),
        eq(movies.titleKey, titleKey),
        input.year ? eq(movies.year, input.year) : sql`${movies.year} is null`,
      ),
    )
    .get();

  if (existing) {
    const patch: Partial<Movie> = { url: input.url ?? existing.url };
    if (input.watched) {
      patch.watched = true;
      patch.watchedAt = now();
    }
    await db.update(movies).set(patch).where(eq(movies.id, existing.id));
    return { movie: { ...existing, ...patch }, created: false };
  }

  const row = {
    id: newId(),
    userId,
    title: input.title,
    titleKey,
    year: input.year,
    url: input.url,
    posterUrl: await findPoster("movie", input.title, input.year),
    watched: input.watched,
    watchedAt: input.watched ? now() : null,
    createdAt: now(),
  };
  await db.insert(movies).values(row);
  return { movie: row, created: true };
}

export async function listMovies(userId: string): Promise<Movie[]> {
  await ready();
  return db
    .select()
    .from(movies)
    .where(eq(movies.userId, userId))
    .orderBy(asc(movies.watched), desc(sql`coalesce(${movies.watchedAt}, ${movies.createdAt})`));
}

export async function setMovieWatched(userId: string, movieId: string, watched: boolean) {
  await ready();
  await db
    .update(movies)
    .set({ watched, watchedAt: watched ? now() : null })
    .where(and(eq(movies.id, movieId), eq(movies.userId, userId)));
}

export async function deleteMovie(userId: string, movieId: string) {
  await ready();
  await db.delete(movies).where(and(eq(movies.id, movieId), eq(movies.userId, userId)));
}

// ---------------------------------------------------------------- history & stats

export type HistoryItem =
  | { type: "episode"; id: string; at: Date; showId: string; title: string; season: number; episode: number; url: string | null; posterUrl: string | null }
  | { type: "movie"; id: string; at: Date; title: string; year: string | null; url: string | null; posterUrl: string | null };

export async function listHistory(userId: string, limit = 150): Promise<HistoryItem[]> {
  await ready();
  const eps = await db
    .select({
      id: episodes.id,
      at: episodes.watchedAt,
      showId: shows.id,
      title: shows.title,
      season: episodes.season,
      episode: episodes.episode,
      url: episodes.url,
      posterUrl: shows.posterUrl,
    })
    .from(episodes)
    .innerJoin(shows, eq(shows.id, episodes.showId))
    // Bulk "mark everything up to here" entries would bury real activity.
    .where(and(eq(episodes.userId, userId), eq(episodes.backfilled, false)))
    .orderBy(desc(episodes.watchedAt))
    .limit(limit);
  const mv = await db
    .select()
    .from(movies)
    .where(and(eq(movies.userId, userId), eq(movies.watched, true)))
    .orderBy(desc(movies.watchedAt))
    .limit(limit);

  const items: HistoryItem[] = [
    ...eps.map((e) => ({ type: "episode" as const, ...e })),
    ...mv.map((m) => ({
      type: "movie" as const,
      id: m.id,
      at: m.watchedAt ?? m.createdAt,
      title: m.title,
      year: m.year,
      url: m.url,
      posterUrl: m.posterUrl,
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export async function getStats(userId: string) {
  await ready();
  const [ep, mv, sh] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(episodes).where(eq(episodes.userId, userId)).get(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(movies)
      .where(and(eq(movies.userId, userId), eq(movies.watched, true)))
      .get(),
    db.select({ n: sql<number>`count(*)` }).from(shows).where(eq(shows.userId, userId)).get(),
  ]);
  return { episodes: Number(ep?.n ?? 0), movies: Number(mv?.n ?? 0), shows: Number(sh?.n ?? 0) };
}
