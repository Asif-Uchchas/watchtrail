/**
 * Turns a raw media link (Circle FTP / h5ai / any HTTP or FTP file server) into
 * something we can track: a TV episode, a movie, or a show folder.
 *
 * Everything here is pure and has no Node/Next dependencies, so it runs on the
 * server and in the browser (for live previews) alike.
 */

export const VIDEO_EXTENSIONS = [
  "mkv", "mp4", "m4v", "avi", "mov", "webm", "wmv", "flv", "ts", "m2ts", "mpg", "mpeg", "3gp",
];

export type ParsedEpisode = {
  kind: "episode";
  url: string;
  showTitle: string;
  showYear: string | null;
  showFolderUrl: string | null;
  season: number;
  episode: number;
  fileName: string;
  quality: string | null;
};

export type ParsedMovie = {
  kind: "movie";
  url: string;
  title: string;
  year: string | null;
  fileName: string;
  quality: string | null;
};

export type ParsedShowFolder = {
  kind: "show";
  url: string;
  showTitle: string;
  showYear: string | null;
  showFolderUrl: string;
  season: number | null;
};

export type ParseResult =
  | ParsedEpisode
  | ParsedMovie
  | ParsedShowFolder
  | { kind: "error"; message: string };

const EPISODE_PATTERNS: RegExp[] = [
  /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]?e(\d{1,3})(?![0-9])/i, // S02E05, s02.e05, S2E5
  /(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?![0-9])/i, // 2x05
  /season[ ._-]?(\d{1,2})[ ._-]*episode[ ._-]?(\d{1,3})/i, // Season 2 Episode 5
];

const SEASON_FOLDER = /^(?:season|series|s)[ ._-]?(\d{1,2})\b/i;
const QUALITY = /\b(2160p|4k|1080p|720p|576p|480p)\b/i;
const NOISE_FOLDERS =
  /^(file|files|ftp|data|media|video|videos|movies?|tv|tv[ ._-]?series|tv[ ._-]?shows?|series|english.*|hindi.*|foreign.*|bangla.*|anime.*|dual.*|\d{3,4}p)$/i;

/** Pull the first http(s)/ftp URL out of free text (e.g. an Android share). */
export function extractUrl(input: string): string | null {
  const match = input.match(/(?:https?|ftp):\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.;]+$/, "") : null;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const SMALL_WORDS = new Set(["of", "the", "and", "a", "an", "in", "on", "at", "to", "for"]);

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** "House (TV Series 2004-2012)" → { title: "House", year: "2004" } */
export function cleanFolderTitle(raw: string): { title: string; year: string | null } {
  let name = raw.trim();
  let year: string | null = null;

  const paren = name.match(/\(([^)]*)\)\s*$/);
  if (paren && paren.index !== undefined) {
    const yearMatch = paren[1].match(/((?:19|20)\d{2})/);
    if (yearMatch) {
      year = yearMatch[1];
      name = name.slice(0, paren.index).trim();
    } else if (/tv|series|mini/i.test(paren[1])) {
      name = name.slice(0, paren.index).trim();
    }
  }

  if (!year) {
    const bare = name.match(/[ ._-]((?:19|20)\d{2})$/);
    if (bare && bare.index !== undefined) {
      year = bare[1];
      name = name.slice(0, bare.index).trim();
    }
  }

  name = name.replace(/[._]+/g, " ").replace(/\s{2,}/g, " ").trim();
  // "the.office.us" reads better title-cased; leave deliberate mixed case alone.
  if (name === name.toLowerCase() || name === name.toUpperCase()) name = titleCase(name);
  return { title: name, year };
}

/** "The.Dark.Knight.2008.1080p.BluRay.x264" → { title: "The Dark Knight", year: "2008" } */
export function cleanMovieTitle(fileStem: string): { title: string; year: string | null } {
  const cut = fileStem.search(
    /[ ._(\[-]((?:19|20)\d{2})(?:[ ._)\]-]|$)|\b(2160p|1080p|720p|480p|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|hdrip|dvdrip|hdtv|x264|x265|hevc|h264)\b/i,
  );
  const yearMatch = fileStem.match(/(?:^|[ ._(\[-])((?:19|20)\d{2})(?:[ ._)\]-]|$)/);
  const raw = cut > 0 ? fileStem.slice(0, cut) : fileStem;
  const { title } = cleanFolderTitle(raw);
  return { title: title || fileStem, year: yearMatch ? yearMatch[1] : null };
}

export function normalizeKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findEpisodeMarker(name: string) {
  for (const pattern of EPISODE_PATTERNS) {
    const m = name.match(pattern);
    if (m && m.index !== undefined) {
      const start = m.index + m[0].search(/[a-z0-9]/i);
      return { season: Number(m[1]), episode: Number(m[2]), start };
    }
  }
  return null;
}

export function parseMediaUrl(input: string): ParseResult {
  const candidate = extractUrl(input.trim()) ?? input.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return {
      kind: "error",
      message: "That doesn't look like a link. Paste the full http:// address you'd open in VLC.",
    };
  }
  if (!/^(https?|ftp):$/.test(url.protocol)) {
    return { kind: "error", message: "Only http, https and ftp links are supported." };
  }

  const rawSegments = url.pathname.split("/").filter(Boolean);
  const segments = rawSegments.map(safeDecode);
  if (segments.length === 0) {
    return {
      kind: "error",
      message: "That's the server's front page. Paste a link to an episode, a movie or a show folder.",
    };
  }

  const last = segments[segments.length - 1];
  const ext = last.includes(".") ? last.split(".").pop()!.toLowerCase() : "";
  const isFile = VIDEO_EXTENSIONS.includes(ext);
  const href = url.toString();

  // Walk up from the file's folder, skipping "Season 2 1080p"-style folders,
  // to find the show's own folder.
  const folderSegments = isFile ? segments.slice(0, -1) : segments;
  let showIndex = -1;
  let seasonFromFolder: number | null = null;
  for (let i = folderSegments.length - 1; i >= 0; i--) {
    const seg = folderSegments[i].trim();
    const seasonMatch = seg.match(SEASON_FOLDER);
    if (seasonMatch) {
      if (seasonFromFolder === null) seasonFromFolder = Number(seasonMatch[1]);
      continue;
    }
    if (NOISE_FOLDERS.test(seg)) continue;
    showIndex = i;
    break;
  }

  const folderUrlFor = (index: number) =>
    `${url.protocol}//${url.host}/${rawSegments.slice(0, index + 1).join("/")}/`;

  if (isFile) {
    const stem = last.slice(0, -(ext.length + 1));
    const marker = findEpisodeMarker(stem);
    const quality = stem.match(QUALITY)?.[1]?.toLowerCase() ?? null;

    if (marker) {
      const fromFolder = showIndex >= 0 ? cleanFolderTitle(folderSegments[showIndex]) : null;
      const fromFile = cleanFolderTitle(stem.slice(0, marker.start).replace(/[ ._-]+$/, ""));
      const pick = fromFolder?.title ? fromFolder : fromFile;
      return {
        kind: "episode",
        url: href,
        showTitle: pick.title || "Unknown show",
        showYear: pick.year ?? fromFile.year,
        showFolderUrl: showIndex >= 0 ? folderUrlFor(showIndex) : null,
        season: marker.season,
        episode: marker.episode,
        fileName: last,
        quality,
      };
    }

    // A file inside a season folder with a bare "05" / "E05" name.
    const bareEp = stem.match(/^(?:e|ep|episode)?[ ._-]?(\d{1,3})(?:[ ._-]|$)/i);
    if (seasonFromFolder !== null && bareEp && showIndex >= 0) {
      const { title, year } = cleanFolderTitle(folderSegments[showIndex]);
      return {
        kind: "episode",
        url: href,
        showTitle: title,
        showYear: year,
        showFolderUrl: folderUrlFor(showIndex),
        season: seasonFromFolder,
        episode: Number(bareEp[1]),
        fileName: last,
        quality,
      };
    }

    // Otherwise it's a movie. Prefer a "Name (2010)" parent folder when there is one.
    const parent = folderSegments[folderSegments.length - 1];
    const parentLooksLikeMovie = !!parent && /\((?:19|20)\d{2}\)\s*$/.test(parent);
    const { title, year } = parentLooksLikeMovie ? cleanFolderTitle(parent) : cleanMovieTitle(stem);
    return { kind: "movie", url: href, title, year, fileName: last, quality };
  }

  if (showIndex < 0) {
    return { kind: "error", message: "Couldn't find a show name in that folder link." };
  }
  const { title, year } = cleanFolderTitle(folderSegments[showIndex]);
  return {
    kind: "show",
    url: href,
    showTitle: title,
    showYear: year,
    showFolderUrl: folderUrlFor(showIndex),
    season: seasonFromFolder,
  };
}

const NEXT_PATTERNS: RegExp[] = [
  /(s\d{1,2}[ ._-]?e)(\d{1,3})(?![0-9])/i,
  /(\d{1,2}x)(\d{2,3})(?![0-9])/i,
  /(episode[ ._-]?)(\d{1,3})(?![0-9])/i,
  /^((?:e|ep)?[ ._-]?)(\d{1,3})(?=[ ._-]|\.[a-z0-9]+$)/i, // bare "05.mkv" / "E05 - Title.mkv"
];

/**
 * Best guess at the link for the following episode: bump the episode number in
 * the file name, keeping its zero padding and letter case. Circle names every
 * episode in a season the same way, so this is right almost every time; the UI
 * always offers the season folder as a fallback.
 */
export function guessNextEpisodeUrl(episodeUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(episodeUrl);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/");
  const lastRaw = parts[parts.length - 1];

  // Edit the still-encoded name first so the rest of the URL is untouched.
  for (const pattern of NEXT_PATTERNS) {
    const m = lastRaw.match(pattern);
    if (m) {
      parts[parts.length - 1] = lastRaw.replace(pattern, m[1] + bump(m[2]));
      url.pathname = parts.join("/");
      return url.toString();
    }
  }
  const decoded = safeDecode(lastRaw);
  for (const pattern of NEXT_PATTERNS) {
    const m = decoded.match(pattern);
    if (m) {
      parts[parts.length - 1] = encodeURIComponent(decoded.replace(pattern, m[1] + bump(m[2])));
      url.pathname = parts.join("/");
      return url.toString();
    }
  }
  return null;
}

function bump(digits: string): string {
  return String(Number(digits) + 1).padStart(digits.length, "0");
}

function pad(value: number, like: string): string {
  return String(value).padStart(like.length, "0");
}

/**
 * Rewrite a known episode link to point at another episode of the same show,
 * e.g. ".../Season 2 1080p/house.s02e05..." → ".../Season 3 1080p/house.s03e01...".
 * Used when someone logs an episode by number, so it still gets a playable link.
 * Returns null if the file name has no SxxEyy marker to rewrite.
 */
export function rewriteEpisodeUrl(episodeUrl: string, season: number, episode: number): string | null {
  let url: URL;
  try {
    url = new URL(episodeUrl);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/");
  const last = parts.length - 1;
  const marker = /(s)(\d{1,2})([ ._-]?e)(\d{1,3})(?![0-9])/i;
  const m = parts[last].match(marker);
  if (!m) return null;
  const oldSeason = Number(m[2]);
  parts[last] = parts[last].replace(marker, `${m[1]}${pad(season, m[2])}${m[3]}${pad(episode, m[4])}`);

  if (oldSeason !== season) {
    // Also move to the other season's folder ("Season%202%201080p" → "Season%203%201080p").
    for (let i = last - 1; i >= 0; i--) {
      const decoded = safeDecode(parts[i]);
      const sm = decoded.match(/^((?:season|series|s)[ ._-]?)(\d{1,2})\b/i);
      if (sm && Number(sm[2]) === oldSeason) {
        parts[i] = encodeURIComponent(decoded.replace(sm[0], `${sm[1]}${pad(season, sm[2])}`));
        break;
      }
    }
  }
  url.pathname = parts.join("/");
  return url.toString();
}

/** The folder that holds a file (the season folder on Circle). */
export function parentFolderUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    url.pathname = url.pathname.replace(/[^/]*$/, "");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function formatEpisode(season: number, episode: number): string {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}
