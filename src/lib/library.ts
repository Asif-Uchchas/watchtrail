import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, ready } from "./db";
import { episodes, links, movies, shows, type Movie, type Show } from "./schema";
import { findPoster, findTvInfo, getSeasonInfo, postersEnabled, type AirInfo, type SeasonEpisode } from "./posters";
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
const REFRESH_MS = 12 * 60 * 60 * 1000;

async function ensureTvInfo(show: Show): Promise<Show> {
  if (!postersEnabled()) return show;
  if (show.tmdbId !== null) {
    // Matched before: keep running shows fresh so new episodes show up on their own.
    const ongoing = show.airStatus !== "Ended" && show.airStatus !== "Canceled";
    const stale = !show.infoAt || (ongoing && Date.now() - show.infoAt.getTime() > REFRESH_MS);
    if (!stale || !show.tmdbId || show.tmdbId <= 0) return show;
    try {
      return (await refreshTvInfo(show.userId, show.id)) ?? show;
    } catch {
      return show;
    }
  }
  const info = await findTvInfo(show.title, show.year);
  const patch: Partial<Show> = {
    tmdbId: info?.tmdbId ?? 0,
    seasonsJson: info ? JSON.stringify(info.seasons) : null,
    airStatus: info?.status ?? null,
    runtime: info?.runtime ?? null,
    airJson: info?.air ? JSON.stringify(info.air) : null,
    infoAt: now(),
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
    runtime: info.runtime ?? show.runtime,
    airJson: info.air ? JSON.stringify(info.air) : null,
    infoAt: now(),
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
    runtime: info?.runtime ?? null,
    airJson: info?.air ? JSON.stringify(info.air) : null,
    infoAt: info ? now() : null,
    rating: null,
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
  const learned = await db
    .select({ url: links.url })
    .from(links)
    .where(and(eq(links.showId, showId), eq(links.season, season), eq(links.episode, episode)))
    .get();
  if (learned) return learned.url;
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
  if (url) await learnLinks(userId, showId, [{ season, episode, url }]);
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
  /** Seconds into nextEpisode where the user stopped; set when nextEpisode is an unfinished one. */
  resumeSeconds: number | null;
  /** "New episode aired" / "S02E10 on Oct 21", when TMDB knows. */
  badge: { kind: "new" | "soon"; text: string } | null;
};

type CardContext = {
  /** Real file links seen in folder listings, keyed "season:episode". */
  learned: Map<string, string>;
  /** An episode that was started but not finished. */
  resume: { season: number; episode: number; seconds: number; url: string | null } | null;
};

const cmpEp = (a: { s: number; e: number }, b: { s: number; e: number }) => a.s - b.s || a.e - b.e;
const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function parseAir(show: Pick<Show, "airJson">): AirInfo | null {
  if (!show.airJson) return null;
  try {
    return JSON.parse(show.airJson) as AirInfo;
  } catch {
    return null;
  }
}

function airBadge(show: Show, next: { season: number; episode: number } | null): ShowCard["badge"] {
  const air = parseAir(show);
  if (!air || show.airStatus === "Ended" || show.airStatus === "Canceled") return null;
  const nextRef = next ? { s: next.season, e: next.episode } : null;
  if (air.last && (!nextRef || cmpEp(nextRef, air.last) <= 0)) {
    const age = air.last.date ? (Date.now() - Date.parse(air.last.date)) / 86_400_000 : 99;
    if (nextRef && age <= 14) return { kind: "new", text: "New episode aired" };
    if (nextRef) return null;
  }
  if (air.next?.date) {
    const days = Math.ceil((Date.parse(air.next.date) - Date.now()) / 86_400_000);
    if (days >= 0) return { kind: "soon", text: formatEpisode(air.next.s, air.next.e) + " on " + shortDate(air.next.date) };
  }
  return null;
}

function toCard(show: Show, watchedCount: number, ctx: CardContext): ShowCard {
  const seasons = parseSeasons(show);
  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  let next = hasProgress
    ? episodeAfter(seasons, show.lastSeason!, show.lastEpisode!)
    : { season: 1, episode: 1 };

  // A started-but-unfinished episode comes before the next new one.
  let resumeSeconds: number | null = null;
  let resumeUrl: string | null = null;
  // (A stop position older than the latest watched episode is stale.)
  const resumeIsCurrent =
    ctx.resume &&
    (!hasProgress ||
      cmpEp({ s: ctx.resume.season, e: ctx.resume.episode }, { s: show.lastSeason!, e: show.lastEpisode! }) >= 0);
  if (ctx.resume && resumeIsCurrent) {
    next = { season: ctx.resume.season, episode: ctx.resume.episode };
    resumeSeconds = ctx.resume.seconds;
    resumeUrl = ctx.resume.url;
  }

  let nextUrl: string | null = null;
  if (next) {
    nextUrl = resumeUrl ?? ctx.learned.get(next.season + ":" + next.episode) ?? null;
    if (!nextUrl) {
      // Rebuild from the last watched file (or the show's example link); this also
      // handles moving to the next season's folder.
      const base = show.lastUrl ?? show.sampleUrl;
      nextUrl = base ? rewriteEpisodeUrl(base, next.season, next.episode) : null;
      if (!nextUrl && show.lastUrl && next.season === show.lastSeason) nextUrl = guessNextEpisodeUrl(show.lastUrl);
    }
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
    resumeSeconds,
    badge: airBadge(show, next),
  };
}

async function cardContexts(userId: string, showIds: string[]): Promise<Map<string, CardContext>> {
  const out = new Map<string, CardContext>();
  for (const id of showIds) out.set(id, { learned: new Map(), resume: null });
  if (!showIds.length) return out;
  const learned = await db
    .select({ showId: links.showId, season: links.season, episode: links.episode, url: links.url })
    .from(links)
    .where(eq(links.userId, userId));
  for (const l of learned) out.get(l.showId)?.learned.set(l.season + ":" + l.episode, l.url);
  const unfinished = await db
    .select({ showId: episodes.showId, season: episodes.season, episode: episodes.episode, url: episodes.url, seconds: episodes.resumeSeconds })
    .from(episodes)
    .where(and(eq(episodes.userId, userId), sql`${episodes.resumeSeconds} > 0`))
    .orderBy(asc(episodes.watchedAt));
  // Latest started episode wins.
  for (const u of unfinished) {
    const ctx = out.get(u.showId);
    if (ctx) ctx.resume = { season: u.season, episode: u.episode, seconds: u.seconds!, url: u.url };
  }
  return out;
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
  const ctxs = await cardContexts(userId, enriched.map((s) => s.id));
  return enriched.map((show, i) => toCard(show, Number(rows[i].watchedCount), ctxs.get(show.id)!));
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
  const ctxs = await cardContexts(userId, [showId]);
  return { show: toCard(show, log.length, ctxs.get(showId)!), episodes: log, seasons: parseSeasons(show) };
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
    rating: null,
    resumeSeconds: null,
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

export const DEFAULT_EPISODE_MINUTES = 42;
export const DEFAULT_MOVIE_MINUTES = 105;

export type WatchStats = {
  episodes: number;
  movies: number;
  shows: number;
  /** Estimated total watch time in minutes (TMDB runtimes where known, typical lengths otherwise). */
  minutes: number;
  /** Timestamps of real (non-backfilled) watches, for streaks and charts in the browser's time zone. */
  activity: number[];
  topShows: { id: string; title: string; posterUrl: string | null; episodes: number; minutes: number }[];
};

export async function getWatchStats(userId: string): Promise<WatchStats> {
  await ready();
  const showRows = await db.select().from(shows).where(eq(shows.userId, userId));
  // Older shows have TMDB data but no runtime yet; fetch it once.
  const filled = await Promise.all(
    showRows.map(async (s) => {
      if (s.runtime || !s.tmdbId || s.tmdbId <= 0 || !postersEnabled()) return s;
      const info = await findTvInfo(s.title, s.year, s.tmdbId);
      const runtime = info?.runtime ?? 0;
      await db.update(shows).set({ runtime }).where(eq(shows.id, s.id));
      return { ...s, runtime };
    }),
  );
  const counts = await db
    .select({ showId: episodes.showId, n: sql<number>`count(*)` })
    .from(episodes)
    .where(eq(episodes.userId, userId))
    .groupBy(episodes.showId);
  const countById = new Map(counts.map((c) => [c.showId, Number(c.n)]));

  const perShow = filled.map((s) => {
    const n = countById.get(s.id) ?? 0;
    return { id: s.id, title: s.title, posterUrl: s.posterUrl, episodes: n, minutes: n * (s.runtime || DEFAULT_EPISODE_MINUTES) };
  });

  const [movieCount, epActivity, movieActivity] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(movies)
      .where(and(eq(movies.userId, userId), eq(movies.watched, true)))
      .get(),
    db
      .select({ at: episodes.watchedAt })
      .from(episodes)
      .where(and(eq(episodes.userId, userId), eq(episodes.backfilled, false)))
      .orderBy(desc(episodes.watchedAt))
      .limit(5000),
    db
      .select({ at: movies.watchedAt })
      .from(movies)
      .where(and(eq(movies.userId, userId), eq(movies.watched, true))),
  ]);
  const movieN = Number(movieCount?.n ?? 0);
  const episodeN = perShow.reduce((a, s) => a + s.episodes, 0);

  return {
    episodes: episodeN,
    movies: movieN,
    shows: showRows.length,
    minutes: perShow.reduce((a, s) => a + s.minutes, 0) + movieN * DEFAULT_MOVIE_MINUTES,
    activity: [...epActivity.map((r) => r.at.getTime()), ...movieActivity.flatMap((r) => (r.at ? [r.at.getTime()] : []))],
    topShows: perShow.filter((s) => s.episodes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 6),
  };
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


// ---------------------------------------------------------------- learned links

/** Remember real file links (from folder listings or plays), so Play never has to guess a file name. */
export async function learnLinks(
  userId: string,
  showId: string,
  items: { season: number; episode: number; url: string }[],
) {
  await ready();
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100).map((it) => ({
      id: newId(),
      userId,
      showId,
      season: it.season,
      episode: it.episode,
      url: it.url,
      seenAt: now(),
    }));
    await db
      .insert(links)
      .values(chunk)
      .onConflictDoUpdate({ target: [links.showId, links.season, links.episode], set: { url: sql`excluded.url`, seenAt: sql`excluded.seen_at` } });
  }
}

// ---------------------------------------------------------------- episode list

export type SeasonRow = {
  episode: number;
  name: string | null;
  overview: string | null;
  runtime: number | null;
  airDate: string | null;
  /** Scheduled but not out yet. */
  unaired: boolean;
  watched: boolean;
  episodeId: string | null;
  url: string | null;
  resumeSeconds: number | null;
};

/** Every episode of a season: TMDB titles/summaries merged with what the user has watched and the best link for each. */
export async function getSeasonRows(userId: string, showId: string, season: number): Promise<SeasonRow[] | null> {
  const detail = await getShowDetail(userId, showId);
  if (!detail) return null;
  const { show } = detail;
  const tmdb: SeasonEpisode[] =
    show.tmdbId && show.tmdbId > 0 ? await getSeasonInfo(show.tmdbId, season).catch(() => []) : [];
  const known = detail.seasons?.[season] ?? 0;
  const watched = new Map(detail.episodes.filter((e) => e.season === season).map((e) => [e.episode, e]));
  const learned = new Map(
    (
      await db
        .select({ episode: links.episode, url: links.url })
        .from(links)
        .where(and(eq(links.showId, showId), eq(links.season, season)))
    ).map((l) => [l.episode, l.url]),
  );
  const ref = await referenceUrl(showId, season);
  const count = Math.max(known, tmdb.length, ...watched.keys(), 0);
  const rows: SeasonRow[] = [];
  for (let n = 1; n <= count; n++) {
    const t = tmdb.find((x) => x.episode === n);
    const w = watched.get(n);
    rows.push({
      episode: n,
      name: t?.name ?? null,
      overview: t?.overview || null,
      runtime: t?.runtime ?? show.runtime ?? null,
      airDate: t?.airDate ?? null,
      unaired: t?.airDate ? Date.parse(t.airDate) > Date.now() : false,
      watched: Boolean(w),
      episodeId: w?.id ?? null,
      url: w?.url ?? learned.get(n) ?? (ref && learned.size === 0 ? rewriteEpisodeUrl(ref, season, n) : null),
      resumeSeconds: w?.resumeSeconds ?? null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------- queue

/** The next few episodes after the current one, with links, for a VLC playlist. */
export async function getQueue(
  userId: string,
  showId: string,
  count = 5,
): Promise<{ show: ShowCard; items: { season: number; episode: number; url: string; title: string | null }[] } | null> {
  const detail = await getShowDetail(userId, showId);
  if (!detail) return null;
  const { show } = detail;
  const seasons = parseSeasons(show);
  const ctx = (await cardContexts(userId, [showId])).get(showId)!;
  const ref = await referenceUrl(showId);
  const items: { season: number; episode: number; url: string; title: string | null }[] = [];
  let cur: { season: number; episode: number } | null =
    show.nextSeason !== null && show.nextEpisode !== null ? { season: show.nextSeason, episode: show.nextEpisode } : null;
  const titles = new Map<number, SeasonEpisode[]>();
  while (cur && items.length < count) {
    const at: { season: number; episode: number } = cur;
    const key = cur.season + ":" + cur.episode;
    // Once a season's folder listing has been seen, a missing file is really missing:
    // guessing its name from another episode's would just produce a dead link.
    const listingSeen = [...ctx.learned.keys()].some((k) => k.startsWith(cur!.season + ":"));
    const url =
      ctx.learned.get(key) ??
      (items.length === 0 && (show.resumeSeconds || !listingSeen) ? show.nextUrl : null) ??
      (listingSeen || !ref ? null : rewriteEpisodeUrl(ref, cur.season, cur.episode));
    if (!url) break;
    let title: string | null = null;
    if (show.tmdbId && show.tmdbId > 0) {
      if (!titles.has(cur.season)) titles.set(cur.season, await getSeasonInfo(show.tmdbId, cur.season).catch(() => []));
      title = titles.get(cur.season)!.find((x) => x.episode === at.episode)?.name ?? null;
    }
    items.push({ season: cur.season, episode: cur.episode, url, title });
    cur = episodeAfter(seasons, cur.season, cur.episode);
  }
  return { show, items };
}

// ---------------------------------------------------------------- resume & ratings

/** Set (or clear, with null) where the user stopped in an episode or movie. */
export async function setResume(userId: string, kind: "episode" | "movie", id: string, seconds: number | null) {
  await ready();
  const value = seconds && seconds > 0 ? Math.round(seconds) : null;
  if (kind === "episode") {
    await db.update(episodes).set({ resumeSeconds: value }).where(and(eq(episodes.id, id), eq(episodes.userId, userId)));
  } else {
    await db.update(movies).set({ resumeSeconds: value }).where(and(eq(movies.id, id), eq(movies.userId, userId)));
  }
}

const urlKey = (u: string) => {
  let x = u;
  try {
    x = decodeURIComponent(u);
  } catch {
    /* keep raw */
  }
  return x.replace(/^[a-z]+:\/\/[^/]+/i, "").toLowerCase();
};

/**
 * A playback position reported by a player on the PC. Matches the file to an
 * episode (or movie) we know, stores the position, and logs the episode once
 * it is nearly finished. Returns what it matched, or null for unknown files.
 */
export async function reportProgress(
  userId: string,
  input: { url: string; seconds: number; length?: number | null },
): Promise<{ kind: "episode" | "movie"; title: string; finished: boolean } | null> {
  await ready();
  const key = urlKey(input.url);
  const done = input.length && input.length > 0 ? input.seconds / input.length >= 0.92 : false;

  const eps = await db
    .select({ id: episodes.id, showId: episodes.showId, season: episodes.season, episode: episodes.episode, url: episodes.url })
    .from(episodes)
    .where(and(eq(episodes.userId, userId), sql`${episodes.url} is not null`));
  const hitEp = eps.find((e) => e.url && urlKey(e.url) === key);
  if (hitEp) {
    const show = await getShow(userId, hitEp.showId);
    await setResume(userId, "episode", hitEp.id, done ? null : input.seconds);
    return { kind: "episode", title: (show?.title ?? "") + " " + formatEpisode(hitEp.season, hitEp.episode), finished: done };
  }

  const learned = await db.select().from(links).where(eq(links.userId, userId));
  const hitLink = learned.find((l) => urlKey(l.url) === key);
  if (hitLink) {
    const show = await getShow(userId, hitLink.showId);
    const { episodeId } = await recordEpisode(userId, hitLink.showId, hitLink.season, hitLink.episode, hitLink.url);
    await setResume(userId, "episode", episodeId, done ? null : input.seconds);
    return { kind: "episode", title: (show?.title ?? "") + " " + formatEpisode(hitLink.season, hitLink.episode), finished: done };
  }

  const mv = await db.select().from(movies).where(and(eq(movies.userId, userId), sql`${movies.url} is not null`));
  const hitMovie = mv.find((m) => m.url && urlKey(m.url) === key);
  if (hitMovie) {
    await setResume(userId, "movie", hitMovie.id, done ? null : input.seconds);
    if (done && !hitMovie.watched) await setMovieWatched(userId, hitMovie.id, true);
    return { kind: "movie", title: hitMovie.title, finished: done };
  }
  return null;
}

export async function setShowRating(userId: string, showId: string, rating: number | null) {
  await ready();
  const value = rating && rating >= 1 && rating <= 5 ? Math.round(rating) : null;
  await db.update(shows).set({ rating: value }).where(and(eq(shows.id, showId), eq(shows.userId, userId)));
}

export async function setMovieRating(userId: string, movieId: string, rating: number | null) {
  await ready();
  const value = rating && rating >= 1 && rating <= 5 ? Math.round(rating) : null;
  await db.update(movies).set({ rating: value }).where(and(eq(movies.id, movieId), eq(movies.userId, userId)));
}
