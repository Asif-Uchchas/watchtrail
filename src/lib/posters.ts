import "server-only";

/**
 * Optional TMDB integration: posters, and for TV shows the real episode count
 * of every season (used for backfilling and rolling over to the next season).
 * Set TMDB_API_KEY (v3 key) or TMDB_READ_TOKEN (v4 read token) to turn it on.
 * Without either, everything still works; you just get generated covers and
 * no season data.
 */
const API = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

export function postersEnabled(): boolean {
  return Boolean(process.env.TMDB_API_KEY || process.env.TMDB_READ_TOKEN);
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!postersEnabled()) return null;
  const query = new URLSearchParams(params);
  if (process.env.TMDB_API_KEY) query.set("api_key", process.env.TMDB_API_KEY);
  const headers: Record<string, string> = { accept: "application/json" };
  if (!process.env.TMDB_API_KEY && process.env.TMDB_READ_TOKEN) {
    headers.authorization = `Bearer ${process.env.TMDB_READ_TOKEN}`;
  }
  try {
    const res = await fetch(`${API}${path}?${query}`, {
      headers,
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type SearchHit = { id: number; poster_path?: string | null };

async function search(kind: "tv" | "movie", title: string, year: string | null): Promise<SearchHit | null> {
  const params: Record<string, string> = { query: title, include_adult: "false" };
  if (year) params[kind === "tv" ? "first_air_date_year" : "year"] = year;
  let data = await tmdb<{ results?: SearchHit[] }>(`/search/${kind}`, params);
  if (!data?.results?.length && year) {
    delete params[kind === "tv" ? "first_air_date_year" : "year"];
    data = await tmdb<{ results?: SearchHit[] }>(`/search/${kind}`, params);
  }
  return data?.results?.[0] ?? null;
}

export async function findPoster(kind: "tv" | "movie", title: string, year: string | null): Promise<string | null> {
  const hit = await search(kind, title, year);
  return hit?.poster_path ? `${IMAGE_BASE}${hit.poster_path}` : null;
}

export type TvInfo = {
  tmdbId: number;
  posterUrl: string | null;
  /** season number → episode count, specials (season 0) excluded */
  seasons: Record<number, number>;
  status: string | null;
  /** Typical episode length in minutes, when TMDB knows it. */
  runtime: number | null;
  /** Latest aired and next scheduled episode, for new-episode alerts. */
  air: AirInfo | null;
};

export type AirEpisode = { s: number; e: number; date: string | null };
export type AirInfo = { last: AirEpisode | null; next: AirEpisode | null };

type TmdbEpisodeRef = { season_number?: number; episode_number?: number; air_date?: string | null } | null;
function airRef(ref: TmdbEpisodeRef | undefined): AirEpisode | null {
  if (!ref || !ref.season_number || !ref.episode_number) return null;
  return { s: ref.season_number, e: ref.episode_number, date: ref.air_date ?? null };
}

export type SeasonEpisode = { episode: number; name: string; overview: string; runtime: number | null; airDate: string | null };

/** Episode titles and summaries for one season (cached a day by Next's fetch cache). */
export async function getSeasonInfo(tmdbId: number, season: number): Promise<SeasonEpisode[]> {
  const data = await tmdb<{
    episodes?: { episode_number: number; name?: string; overview?: string; runtime?: number | null; air_date?: string | null }[];
  }>(`/tv/${tmdbId}/season/${season}`);
  return (data?.episodes ?? []).map((e) => ({
    episode: e.episode_number,
    name: e.name ?? "",
    overview: e.overview ?? "",
    runtime: e.runtime ?? null,
    airDate: e.air_date ?? null,
  }));
}

/** Look up a show and its season sizes. Returns null when TMDB is off or nothing matched. */
export async function findTvInfo(title: string, year: string | null, knownId?: number | null): Promise<TvInfo | null> {
  const id = knownId && knownId > 0 ? knownId : (await search("tv", title, year))?.id;
  if (!id) return null;
  const details = await tmdb<{
    poster_path?: string | null;
    status?: string;
    episode_run_time?: number[];
    last_episode_to_air?: ({ runtime?: number | null } & NonNullable<TmdbEpisodeRef>) | null;
    next_episode_to_air?: TmdbEpisodeRef;
    seasons?: { season_number: number; episode_count: number }[];
  }>(`/tv/${id}`);
  if (!details) return null;
  const seasons: Record<number, number> = {};
  for (const s of details.seasons ?? []) {
    if (s.season_number > 0 && s.episode_count > 0) seasons[s.season_number] = s.episode_count;
  }
  return {
    tmdbId: id,
    posterUrl: details.poster_path ? `${IMAGE_BASE}${details.poster_path}` : null,
    seasons,
    status: details.status ?? null,
    runtime: details.episode_run_time?.find((m) => m > 0) ?? details.last_episode_to_air?.runtime ?? null,
    air: { last: airRef(details.last_episode_to_air), next: airRef(details.next_episode_to_air) },
  };
}
