import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, ready } from "./db";
import { episodes, movies, shows, type Movie, type Show } from "./schema";
import { findPoster } from "./posters";
import { formatEpisode, guessNextEpisodeUrl, normalizeKey, parentFolderUrl, rewriteEpisodeUrl } from "./parse";

const now = () => new Date();
const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------- shows

export async function upsertShow(
  userId: string,
  input: { title: string; year: string | null; folderUrl: string | null },
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
    if (Object.keys(patch).length) {
      await db.update(shows).set(patch).where(eq(shows.id, existing.id));
      return { show: { ...existing, ...patch }, created: false };
    }
    return { show: existing, created: false };
  }

  const posterUrl = await findPoster("tv", input.title, input.year);
  const row = {
    id: newId(),
    userId,
    title: input.title,
    titleKey,
    year: input.year,
    folderUrl: input.folderUrl,
    posterUrl,
    status: "watching" as const,
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

/** Build a link for an episode logged by number, from any other episode we have a link for. */
async function deriveEpisodeUrl(showId: string, season: number, episode: number): Promise<string | null> {
  const refs = await db
    .select({ season: episodes.season, url: episodes.url })
    .from(episodes)
    .where(and(eq(episodes.showId, showId), sql`${episodes.url} is not null`))
    .orderBy(desc(episodes.watchedAt))
    .limit(20);
  // Prefer a reference from the same season: its folder name is certainly right.
  const sameSeason = refs.find((r) => r.season === season);
  for (const ref of sameSeason ? [sameSeason, ...refs] : refs) {
    const derived = rewriteEpisodeUrl(ref.url!, season, episode);
    if (derived) return derived;
  }
  return null;
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
      .set({ watchedAt: now(), url: url ?? existing.url })
      .where(eq(episodes.id, existing.id));
  } else {
    await db.insert(episodes).values({
      id: newId(),
      userId,
      showId,
      season,
      episode,
      url,
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

export async function updateShow(
  userId: string,
  showId: string,
  patch: Partial<Pick<Show, "title" | "folderUrl" | "status" | "year">>,
) {
  await ready();
  const set: Partial<Show> = { ...patch, updatedAt: now() };
  if (patch.title) set.titleKey = normalizeKey(patch.title);
  await db.update(shows).set(set).where(and(eq(shows.id, showId), eq(shows.userId, userId)));
}

export async function deleteShow(userId: string, showId: string) {
  await ready();
  await db.delete(episodes).where(and(eq(episodes.showId, showId), eq(episodes.userId, userId)));
  await db.delete(shows).where(and(eq(shows.id, showId), eq(shows.userId, userId)));
}

export type ShowCard = Show & {
  nextLabel: string | null;
  nextUrl: string | null;
  seasonFolderUrl: string | null;
  watchedCount: number;
};

function toCard(show: Show, watchedCount: number): ShowCard {
  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  return {
    ...show,
    watchedCount,
    nextLabel: hasProgress ? formatEpisode(show.lastSeason!, show.lastEpisode! + 1) : null,
    nextUrl: show.lastUrl ? guessNextEpisodeUrl(show.lastUrl) : null,
    seasonFolderUrl: show.lastUrl ? parentFolderUrl(show.lastUrl) : show.folderUrl,
  };
}

export async function listShows(userId: string): Promise<ShowCard[]> {
  await ready();
  const rows = await db
    .select({
      show: shows,
      watchedCount: sql<number>`(select count(*) from ${episodes} where ${episodes.showId} = ${shows.id})`,
    })
    .from(shows)
    .where(eq(shows.userId, userId))
    .orderBy(desc(sql`coalesce(${shows.lastWatchedAt}, ${shows.createdAt})`));
  return rows.map((r) => toCard(r.show, Number(r.watchedCount)));
}

export async function getShowDetail(userId: string, showId: string) {
  const show = await getShow(userId, showId);
  if (!show) return null;
  const log = await db
    .select()
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .orderBy(asc(episodes.season), asc(episodes.episode));
  return { show: toCard(show, log.length), episodes: log };
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
    .where(eq(episodes.userId, userId))
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
