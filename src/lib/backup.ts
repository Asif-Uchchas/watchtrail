import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, ready } from "./db";
import { episodes, movies, shows } from "./schema";
import { normalizeKey } from "./parse";

export async function exportLibrary(userId: string) {
  await ready();
  const showRows = await db.select().from(shows).where(eq(shows.userId, userId));
  const epRows = await db.select().from(episodes).where(eq(episodes.userId, userId));
  const movieRows = await db.select().from(movies).where(eq(movies.userId, userId));

  return {
    app: "watchtrail",
    version: 1,
    exportedAt: new Date().toISOString(),
    shows: showRows.map((s) => ({
      title: s.title,
      year: s.year,
      folderUrl: s.folderUrl,
      sampleUrl: s.sampleUrl,
      posterUrl: s.posterUrl,
      status: s.status,
      episodes: epRows
        .filter((e) => e.showId === s.id)
        .map((e) => ({
          season: e.season,
          episode: e.episode,
          url: e.url,
          backfilled: e.backfilled,
          watchedAt: e.watchedAt.getTime(),
        })),
    })),
    movies: movieRows.map((m) => ({
      title: m.title,
      year: m.year,
      url: m.url,
      posterUrl: m.posterUrl,
      watched: m.watched,
      watchedAt: m.watchedAt?.getTime() ?? null,
    })),
  };
}

const backupSchema = z.object({
  app: z.literal("watchtrail"),
  version: z.literal(1),
  shows: z
    .array(
      z.object({
        title: z.string().min(1),
        year: z.string().nullable().optional(),
        folderUrl: z.string().nullable().optional(),
        sampleUrl: z.string().nullable().optional(),
        posterUrl: z.string().nullable().optional(),
        status: z.enum(["watching", "paused", "completed", "dropped"]).optional(),
        episodes: z.array(
          z.object({
            season: z.number().int().min(0).max(99),
            episode: z.number().int().min(0).max(999),
            url: z.string().nullable().optional(),
            backfilled: z.boolean().optional(),
            watchedAt: z.number(),
          }),
        ),
      }),
    )
    .default([]),
  movies: z
    .array(
      z.object({
        title: z.string().min(1),
        year: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        posterUrl: z.string().nullable().optional(),
        watched: z.boolean(),
        watchedAt: z.number().nullable().optional(),
      }),
    )
    .default([]),
});

/** Merge a backup into the user's library. Existing entries are kept; nothing is overwritten or deleted. */
export async function importLibrary(userId: string, raw: string): Promise<{ shows: number; episodes: number; movies: number } | { error: string }> {
  await ready();
  let parsed;
  try {
    parsed = backupSchema.safeParse(JSON.parse(raw));
  } catch {
    return { error: "That file isn't valid JSON." };
  }
  if (!parsed.success) return { error: "That doesn't look like a Watchtrail backup." };

  let showCount = 0;
  let episodeCount = 0;
  let movieCount = 0;
  const when = Date.now();

  for (const s of parsed.data.shows) {
    const titleKey = normalizeKey(s.title);
    let row = await db.select().from(shows).where(eq(shows.userId, userId)).all().then((all) => all.find((x) => x.titleKey === titleKey));
    if (!row) {
      const id = crypto.randomUUID();
      await db.insert(shows).values({
        id,
        userId,
        title: s.title,
        titleKey,
        year: s.year ?? null,
        folderUrl: s.folderUrl ?? null,
        sampleUrl: s.sampleUrl ?? null,
        posterUrl: s.posterUrl ?? null,
        status: s.status ?? "watching",
        createdAt: new Date(when),
        updatedAt: new Date(when),
      });
      row = (await db.select().from(shows).where(eq(shows.id, id)).get())!;
      showCount++;
    }
    const showId = row.id;
    const rows = s.episodes.map((e) => ({
      id: crypto.randomUUID(),
      userId,
      showId,
      season: e.season,
      episode: e.episode,
      url: e.url ?? null,
      backfilled: e.backfilled ?? false,
      watchedAt: new Date(e.watchedAt),
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const res = await db.insert(episodes).values(rows.slice(i, i + 100)).onConflictDoNothing();
      episodeCount += Number(res.rowsAffected ?? 0);
    }
    // Recompute the "last watched" pointer from the merged log.
    const all = await db.select().from(episodes).where(eq(episodes.showId, showId));
    if (all.length) {
      const last = all.reduce((a, b) => (a.season > b.season || (a.season === b.season && a.episode > b.episode) ? a : b));
      const lastAt = Math.max(...all.map((e) => e.watchedAt.getTime()));
      await db
        .update(shows)
        .set({ lastSeason: last.season, lastEpisode: last.episode, lastUrl: last.url, lastWatchedAt: new Date(lastAt) })
        .where(eq(shows.id, showId));
    }
  }

  for (const m of parsed.data.movies) {
    const res = await db
      .insert(movies)
      .values({
        id: crypto.randomUUID(),
        userId,
        title: m.title,
        titleKey: normalizeKey(m.title),
        year: m.year ?? null,
        url: m.url ?? null,
        posterUrl: m.posterUrl ?? null,
        watched: m.watched,
        watchedAt: m.watchedAt ? new Date(m.watchedAt) : null,
        createdAt: new Date(when),
      })
      .onConflictDoNothing();
    movieCount += Number(res.rowsAffected ?? 0);
  }

  return { shows: showCount, episodes: episodeCount, movies: movieCount };
}
