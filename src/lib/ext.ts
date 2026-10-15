import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, ready } from "./db";
import { episodes, movies, shows, users } from "./schema";
import { formatEpisode, normalizeKey, parseMediaUrl } from "./parse";
import { learnLinks, recordEpisode, upsertMovie, upsertShow } from "./library";

/** The browser helper's personal token (created on first use). */
export async function getOrCreateToken(userId: string): Promise<string> {
  await ready();
  const row = await db.select({ t: users.apiToken }).from(users).where(eq(users.id, userId)).get();
  if (row?.t) return row.t;
  return rotateToken(userId);
}

export async function rotateToken(userId: string): Promise<string> {
  await ready();
  const token = `wt_${randomBytes(24).toString("base64url")}`;
  await db.update(users).set({ apiToken: token }).where(eq(users.id, userId));
  return token;
}

export async function userIdForToken(header: string | null): Promise<string | null> {
  const token = header?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 20) return null;
  await ready();
  const row = await db.select({ id: users.id }).from(users).where(eq(users.apiToken, token)).get();
  return row?.id ?? null;
}

/** Which of these file links has the user already watched? Matches by show + episode (or movie), not by exact URL. */
export async function watchedAmong(userId: string, urls: string[]): Promise<string[]> {
  await ready();
  const eps = await db
    .select({ key: shows.titleKey, season: episodes.season, episode: episodes.episode })
    .from(episodes)
    .innerJoin(shows, eq(shows.id, episodes.showId))
    .where(eq(episodes.userId, userId));
  const seen = new Set(eps.map((e) => `${e.key}|${e.season}|${e.episode}`));
  const mv = await db
    .select({ key: movies.titleKey, year: movies.year })
    .from(movies)
    .where(and(eq(movies.userId, userId), eq(movies.watched, true)));
  const seenMovies = new Set(mv.map((m) => `${m.key}|${m.year ?? ""}`));

  return urls.filter((u) => {
    const p = parseMediaUrl(u);
    if (p.kind === "episode") return seen.has(`${normalizeKey(p.showTitle)}|${p.season}|${p.episode}`);
    if (p.kind === "movie") return seenMovies.has(`${normalizeKey(p.title)}|${p.year ?? ""}`);
    return false;
  });
}

/** Mark a pasted file link as watched (episode or movie). */
export async function logUrl(userId: string, url: string): Promise<{ ok: boolean; message: string }> {
  const p = parseMediaUrl(url);
  if (p.kind === "error") return { ok: false, message: p.message };
  if (p.kind === "episode") {
    const { show } = await upsertShow(userId, {
      title: p.showTitle,
      year: p.showYear,
      folderUrl: p.showFolderUrl,
      sampleUrl: p.url,
    });
    await recordEpisode(userId, show.id, p.season, p.episode, p.url);
    return { ok: true, message: `${show.title} ${formatEpisode(p.season, p.episode)}` };
  }
  if (p.kind === "movie") {
    const { movie } = await upsertMovie(userId, { title: p.title, year: p.year, url: p.url, watched: true });
    return { ok: true, message: movie.year ? `${movie.title} (${movie.year})` : movie.title };
  }
  return { ok: false, message: "That link is a folder, not a video file." };
}

/**
 * File links seen on a folder page. For shows the user already tracks, remember
 * the real link of each episode so Play never has to guess the file name.
 */
export async function learnFromListing(userId: string, urls: string[]): Promise<number> {
  await ready();
  const own = await db.select({ id: shows.id, key: shows.titleKey }).from(shows).where(eq(shows.userId, userId));
  const byKey = new Map(own.map((s) => [s.key, s.id]));
  const grouped = new Map<string, { season: number; episode: number; url: string }[]>();
  for (const u of urls) {
    const p = parseMediaUrl(u);
    if (p.kind !== "episode") continue;
    const showId = byKey.get(normalizeKey(p.showTitle));
    if (!showId) continue;
    const list = grouped.get(showId) ?? [];
    list.push({ season: p.season, episode: p.episode, url: p.url });
    grouped.set(showId, list);
  }
  let n = 0;
  for (const [showId, items] of grouped) {
    await learnLinks(userId, showId, items);
    n += items.length;
  }
  return n;
}
/** Where the user stopped in each of these file links (seconds), for those that are partly watched. */
export async function resumeAmong(userId: string, urls: string[]): Promise<Record<string, number>> {
  await ready();
  const eps = await db
    .select({ key: shows.titleKey, season: episodes.season, episode: episodes.episode, seconds: episodes.resumeSeconds })
    .from(episodes)
    .innerJoin(shows, eq(shows.id, episodes.showId))
    .where(and(eq(episodes.userId, userId), gt(episodes.resumeSeconds, 0)));
  const byEpisode = new Map(eps.map((e) => [`${e.key}|${e.season}|${e.episode}`, e.seconds!]));
  const mv = await db
    .select({ key: movies.titleKey, year: movies.year, seconds: movies.resumeSeconds })
    .from(movies)
    .where(and(eq(movies.userId, userId), gt(movies.resumeSeconds, 0)));
  const byMovie = new Map(mv.map((m) => [`${m.key}|${m.year ?? ""}`, m.seconds!]));

  const out: Record<string, number> = {};
  for (const u of urls) {
    const p = parseMediaUrl(u);
    const seconds =
      p.kind === "episode"
        ? byEpisode.get(`${normalizeKey(p.showTitle)}|${p.season}|${p.episode}`)
        : p.kind === "movie"
          ? byMovie.get(`${normalizeKey(p.title)}|${p.year ?? ""}`)
          : undefined;
    if (seconds) out[u] = seconds;
  }
  return out;
}
