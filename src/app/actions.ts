"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { db, ready } from "@/lib/db";
import { users, type ShowStatus } from "@/lib/schema";
import { formatEpisode, normalizeKey, parseMediaUrl } from "@/lib/parse";
import { importLibrary } from "@/lib/backup";
import { rotateToken } from "@/lib/ext";
import {
  clearSeason,
  deleteMovie,
  deleteShow,
  getShow,
  markUpTo,
  recordEpisode,
  refreshTvInfo,
  removeEpisode,
  setMovieRating,
  setMovieWatched,
  setResume,
  setSampleUrl,
  setShowRating,
  updateShow,
  upsertMovie,
  upsertShow,
} from "@/lib/library";

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

export type BackfillOffer = { showId: string; season: number; episode: number; label: string };

export type ActionResult =
  | {
      ok: true;
      message: string;
      href?: string;
      undo?: { kind: "episode" | "movie"; id: string };
      /** Suggest marking every earlier episode too (first log of a show, partway through). */
      offer?: BackfillOffer;
    }
  | { ok: false; error: string };

function refreshAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- auth

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (process.env.ALLOW_SIGNUPS === "false") {
    return { error: "New sign-ups are closed on this server. Ask the owner for an account." };
  }
  const fields = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  const parsed = credentials
    .extend({ name: z.string().trim().min(1, "Tell us your name.").max(60) })
    .safeParse({ ...fields, password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };

  await ready();
  const taken = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).get();
  if (taken) return { error: "An account with that email already exists. Try signing in.", fields };

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    createdAt: new Date(),
  });
  await createSession(id);
  redirect(safeNext(formData.get("next")));
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "/");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const fields = { email: String(formData.get("email") ?? "") };
  const parsed = credentials.safeParse({ ...fields, password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password.", fields };

  await ready();
  const user = await db.select().from(users).where(eq(users.email, parsed.data.email)).get();
  const valid = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) return { error: "That email and password don't match.", fields };

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------- adding links

/**
 * The one entry point for pasted / shared links.
 * mode "watched" logs the episode or movie as seen; mode "track" only adds the
 * show (or puts the movie on the watchlist).
 */
export async function addLink(input: string, mode: "watched" | "track" = "watched"): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parseMediaUrl(input);

  switch (parsed.kind) {
    case "error":
      return { ok: false, error: parsed.message };

    case "episode": {
      const { show } = await upsertShow(user.id, {
        title: parsed.showTitle,
        year: parsed.showYear,
        folderUrl: parsed.showFolderUrl,
        sampleUrl: parsed.url,
      });
      const label = formatEpisode(parsed.season, parsed.episode);
      if (mode === "track") {
        refreshAll();
        return { ok: true, message: `${show.title} is in your shows.`, href: `/shows/${show.id}` };
      }
      const hadProgress = show.lastSeason !== null;
      const { episodeId, alreadyWatched } = await recordEpisode(
        user.id,
        show.id,
        parsed.season,
        parsed.episode,
        parsed.url,
      );
      refreshAll();
      const startedMidway = !hadProgress && (parsed.season > 1 || parsed.episode > 1);
      return {
        ok: true,
        message: alreadyWatched
          ? `${show.title} ${label} was already watched. Updated the time.`
          : `Marked ${show.title} ${label} as watched.`,
        href: `/shows/${show.id}`,
        undo: alreadyWatched ? undefined : { kind: "episode", id: episodeId },
        offer: startedMidway
          ? { showId: show.id, season: parsed.season, episode: parsed.episode, label: `Everything before ${label} too?` }
          : undefined,
      };
    }

    case "show": {
      const { show, created } = await upsertShow(user.id, {
        title: parsed.showTitle,
        year: parsed.showYear,
        folderUrl: parsed.showFolderUrl,
      });
      refreshAll();
      return {
        ok: true,
        message: created ? `Added ${show.title}. Paste an episode link to log progress.` : `${show.title} is already in your shows.`,
        href: `/shows/${show.id}`,
      };
    }

    case "movie": {
      const watched = mode === "watched";
      const { movie, created } = await upsertMovie(user.id, {
        title: parsed.title,
        year: parsed.year,
        url: parsed.url,
        watched,
      });
      refreshAll();
      const name = movie.year ? `${movie.title} (${movie.year})` : movie.title;
      return {
        ok: true,
        message: watched ? `Marked ${name} as watched.` : `Added ${name} to your watchlist.`,
        href: "/movies",
        undo: created ? { kind: "movie", id: movie.id } : undefined,
      };
    }
  }
}

// ---------------------------------------------------------------- shows

export async function markEpisode(
  showId: string,
  season: number,
  episode: number,
  url: string | null,
  /** True for "Mark watched": also forgets any saved stop position. */
  finished = false,
): Promise<ActionResult> {
  const user = await requireUser();
  const show = await getShow(user.id, showId);
  if (!show) return { ok: false, error: "Show not found." };
  if (!Number.isInteger(season) || !Number.isInteger(episode) || season < 0 || episode < 0 || season > 99 || episode > 999) {
    return { ok: false, error: "Season and episode must be whole numbers." };
  }
  const { episodeId, alreadyWatched } = await recordEpisode(user.id, show.id, season, episode, url);
  if (finished) await setResume(user.id, "episode", episodeId, null);
  refreshAll();
  return {
    ok: true,
    message: `${show.title} ${formatEpisode(season, episode)} marked as watched.`,
    undo: alreadyWatched ? undefined : { kind: "episode", id: episodeId },
  };
}

export async function unmarkEpisode(episodeId: string): Promise<ActionResult> {
  const user = await requireUser();
  await removeEpisode(user.id, episodeId);
  refreshAll();
  return { ok: true, message: "Removed from your history." };
}

const validEpisode = (season: number, episode: number) =>
  Number.isInteger(season) && Number.isInteger(episode) && season >= 1 && episode >= 1 && season <= 99 && episode <= 999;

/** Log an episode and every episode before it (earlier seasons via TMDB episode counts). */
export async function markThrough(showId: string, season: number, episode: number): Promise<ActionResult> {
  const user = await requireUser();
  if (!validEpisode(season, episode)) return { ok: false, error: "Season and episode must be whole numbers from 1." };
  const result = await markUpTo(user.id, showId, season, episode);
  if (!result) return { ok: false, error: "Show not found." };
  refreshAll();
  const label = formatEpisode(season, episode);
  const parts = [
    result.added
      ? `Marked ${result.added + 1} episodes up to ${label} as watched.`
      : `Logged ${label}; the earlier episodes were already marked.`,
  ];
  if (result.skippedSeasons.length) {
    const list = result.skippedSeasons.join(", ");
    parts.push(
      `Couldn't fill season${result.skippedSeasons.length > 1 ? "s" : ""} ${list} because the episode count isn't known. Log the last episode of ${result.skippedSeasons.length > 1 ? "each" : "that"} season to fill it.`,
    );
  }
  return { ok: true, message: parts.join(" ") };
}

/** "Set your place": one episode, or that episode plus everything before it. */
export async function logProgress(
  showId: string,
  season: number,
  episode: number,
  includeEarlier: boolean,
): Promise<ActionResult> {
  return includeEarlier ? markThrough(showId, season, episode) : markEpisode(showId, season, episode, null);
}

export async function clearSeasonLog(showId: string, season: number): Promise<ActionResult> {
  const user = await requireUser();
  await clearSeason(user.id, showId, season);
  refreshAll();
  return { ok: true, message: `Cleared season ${season} from your log.` };
}

export async function refreshShowInfo(showId: string): Promise<ActionResult> {
  const user = await requireUser();
  const show = await refreshTvInfo(user.id, showId);
  if (!show) return { ok: false, error: "Show not found." };
  refreshAll();
  return show.seasonsJson
    ? { ok: true, message: "Episode list updated from TMDB." }
    : { ok: false, error: "TMDB didn't recognise this title. Try renaming the show (Edit) to its official name." };
}

/**
 * Give a show one real episode link so Watchtrail can build Play links for
 * every other episode from it. Doesn't log anything as watched.
 */
export async function attachEpisodeLink(showId: string, input: string): Promise<ActionResult> {
  const user = await requireUser();
  const show = await getShow(user.id, showId);
  if (!show) return { ok: false, error: "Show not found." };
  const parsed = parseMediaUrl(input);
  if (parsed.kind === "error") return { ok: false, error: parsed.message };
  if (parsed.kind !== "episode") {
    return { ok: false, error: "That's a folder or movie link. Paste the link to an episode file (â€¦s02e01â€¦.mkv)." };
  }
  if (normalizeKey(parsed.showTitle) !== show.titleKey) {
    return { ok: false, error: `That link looks like â€œ${parsed.showTitle}â€, not ${show.title}.` };
  }
  await setSampleUrl(user.id, show.id, parsed.url);
  refreshAll();
  return { ok: true, message: `Play is on for ${show.title}.` };
}

const showPatch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  folderUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^(https?|ftp):\/\//i.test(v), "Folder link must start with http:// or https://")
    .optional(),
  status: z.enum(["watching", "paused", "completed", "dropped"]).optional(),
});

export async function editShow(
  showId: string,
  patch: { title?: string; folderUrl?: string; status?: ShowStatus },
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = showPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await updateShow(user.id, showId, {
      ...parsed.data,
      folderUrl: parsed.data.folderUrl === "" ? null : parsed.data.folderUrl,
    });
  } catch {
    return { ok: false, error: "You already have a show with that name." };
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}

export async function removeShow(showId: string) {
  const user = await requireUser();
  await deleteShow(user.id, showId);
  refreshAll();
  redirect("/");
}

// ---------------------------------------------------------------- movies

export async function toggleMovie(movieId: string, watched: boolean): Promise<ActionResult> {
  const user = await requireUser();
  await setMovieWatched(user.id, movieId, watched);
  refreshAll();
  return { ok: true, message: watched ? "Marked as watched." : "Moved back to your watchlist." };
}

export async function removeMovie(movieId: string): Promise<ActionResult> {
  const user = await requireUser();
  await deleteMovie(user.id, movieId);
  refreshAll();
  return { ok: true, message: "Movie removed." };
}

export async function undo(kind: "episode" | "movie", id: string): Promise<ActionResult> {
  return kind === "episode" ? unmarkEpisode(id) : removeMovie(id);
}

// ---------------------------------------------------------------- settings

export async function regenerateApiToken(): Promise<ActionResult> {
  const user = await requireUser();
  await rotateToken(user.id);
  revalidatePath("/settings");
  return { ok: true, message: "New token created. Paste it into the browser helper again." };
}

export async function importBackup(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a backup file first." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "That file is too large for a backup." };
  const result = await importLibrary(user.id, await file.text());
  if ("error" in result) return { ok: false, error: result.error };
  refreshAll();
  return {
    ok: true,
    message: `Imported ${result.episodes} episodes, ${result.movies} movies and ${result.shows} new shows.`,
  };
}

// ---------------------------------------------------------------- resume & ratings

/** "I stopped at 21:30": logs the episode if needed and remembers the position. */
export async function setStoppedAt(
  showId: string,
  season: number,
  episode: number,
  seconds: number,
): Promise<ActionResult> {
  const user = await requireUser();
  const show = await getShow(user.id, showId);
  if (!show) return { ok: false, error: "Show not found." };
  if (!validEpisode(season, episode)) return { ok: false, error: "Pick a valid season and episode." };
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) return { ok: false, error: "That time doesn't look right." };
  const { episodeId } = await recordEpisode(user.id, show.id, season, episode, null);
  await setResume(user.id, "episode", episodeId, seconds || null);
  refreshAll();
  return {
    ok: true,
    message: seconds
      ? `Saved: ${show.title} ${formatEpisode(season, episode)} stopped at ${formatClock(seconds)}.`
      : "Position cleared.",
  };
}

function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export async function clearStoppedAt(episodeId: string): Promise<ActionResult> {
  const user = await requireUser();
  await setResume(user.id, "episode", episodeId, null);
  refreshAll();
  return { ok: true, message: "Position cleared." };
}

export async function rateShow(showId: string, rating: number | null): Promise<ActionResult> {
  const user = await requireUser();
  await setShowRating(user.id, showId, rating);
  refreshAll();
  return { ok: true, message: rating ? `Rated ${rating} of 5.` : "Rating removed." };
}

export async function rateMovie(movieId: string, rating: number | null): Promise<ActionResult> {
  const user = await requireUser();
  await setMovieRating(user.id, movieId, rating);
  refreshAll();
  return { ok: true, message: rating ? `Rated ${rating} of 5.` : "Rating removed." };
}

// ---------------------------------------------------------------- manual naming

const manualSchema = z.object({
  url: z.string().trim().url("Paste a full link first.").max(2000),
  title: z.string().trim().min(1, "Type the title.").max(200),
  kind: z.enum(["movie", "episode"]),
  year: z.number().int().min(1888).max(2100).nullable(),
  season: z.number().int().min(0).max(99).nullable(),
  episode: z.number().int().min(1).max(999).nullable(),
  mode: z.enum(["watched", "track"]),
});

/**
 * For links whose file name says nothing (dflix.live/api/download/362003 and the like): the user
 * tells us what the link is, and we store it against that title. TMDB matching then works from the title.
 */
export async function addLinkManual(input: z.input<typeof manualSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const v = parsed.data;

  if (v.kind === "movie") {
    const { movie } = await upsertMovie(user.id, { title: v.title, year: v.year === null ? null : String(v.year), url: v.url, watched: v.mode === "watched" });
    refreshAll();
    const name = movie.year ? `${movie.title} (${movie.year})` : movie.title;
    return {
      ok: true,
      message: v.mode === "watched" ? `Marked ${name} as watched.` : `Added ${name} to your watchlist.`,
      href: "/movies",
    };
  }

  if (v.season === null || v.episode === null) return { ok: false, error: "Enter the season and episode number." };
  const { show } = await upsertShow(user.id, { title: v.title, year: v.year === null ? null : String(v.year), folderUrl: null, sampleUrl: v.url });
  const label = formatEpisode(v.season, v.episode);
  if (v.mode === "track") {
    refreshAll();
    return { ok: true, message: `${show.title} is in your shows.`, href: `/shows/${show.id}` };
  }
  const { episodeId, alreadyWatched } = await recordEpisode(user.id, show.id, v.season, v.episode, v.url);
  refreshAll();
  return {
    ok: true,
    message: alreadyWatched ? `${show.title} ${label} was already watched.` : `Marked ${show.title} ${label} as watched.`,
    href: `/shows/${show.id}`,
    undo: alreadyWatched ? undefined : { kind: "episode", id: episodeId },
  };
}
