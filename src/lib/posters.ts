import "server-only";

/**
 * Optional poster artwork from TMDB. Set TMDB_API_KEY (a v3 API key) or
 * TMDB_READ_TOKEN (a v4 read access token) to turn it on. Without either the
 * app shows generated cover tiles instead, and nothing else changes.
 */
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

export function postersEnabled(): boolean {
  return Boolean(process.env.TMDB_API_KEY || process.env.TMDB_READ_TOKEN);
}

export async function findPoster(
  kind: "tv" | "movie",
  title: string,
  year: string | null,
): Promise<string | null> {
  if (!postersEnabled()) return null;

  const params = new URLSearchParams({ query: title, include_adult: "false" });
  if (year) params.set(kind === "tv" ? "first_air_date_year" : "year", year);
  if (process.env.TMDB_API_KEY) params.set("api_key", process.env.TMDB_API_KEY);

  const headers: Record<string, string> = { accept: "application/json" };
  if (!process.env.TMDB_API_KEY && process.env.TMDB_READ_TOKEN) {
    headers.authorization = `Bearer ${process.env.TMDB_READ_TOKEN}`;
  }

  try {
    let results = await search(kind, params, headers);
    if (results.length === 0 && year) {
      params.delete(kind === "tv" ? "first_air_date_year" : "year");
      results = await search(kind, params, headers);
    }
    const hit = results.find((r) => r.poster_path);
    return hit?.poster_path ? `${IMAGE_BASE}${hit.poster_path}` : null;
  } catch {
    return null;
  }
}

async function search(
  kind: "tv" | "movie",
  params: URLSearchParams,
  headers: Record<string, string>,
): Promise<{ poster_path?: string | null }[]> {
  const res = await fetch(`https://api.themoviedb.org/3/search/${kind}?${params}`, {
    headers,
    signal: AbortSignal.timeout(4000),
    cache: "force-cache",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { poster_path?: string | null }[] };
  return data.results ?? [];
}
