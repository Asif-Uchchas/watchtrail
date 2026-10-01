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
import {
  deleteMovie,
  deleteShow,
  getShow,
  recordEpisode,
  removeEpisode,
  setMovieWatched,
  setSampleUrl,
  updateShow,
  upsertMovie,
  upsertShow,
} from "@/lib/library";

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

export type ActionResult =
  | { ok: true; message: string; href?: string; undo?: { kind: "episode" | "movie"; id: string } }
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
      const { episodeId, alreadyWatched } = await recordEpisode(
        user.id,
        show.id,
        parsed.season,
        parsed.episode,
        parsed.url,
      );
      refreshAll();
      return {
        ok: true,
        message: alreadyWatched
          ? `${show.title} ${label} was already watched. Updated the time.`
          : `Marked ${show.title} ${label} as watched.`,
        href: `/shows/${show.id}`,
        undo: alreadyWatched ? undefined : { kind: "episode", id: episodeId },
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
): Promise<ActionResult> {
  const user = await requireUser();
  const show = await getShow(user.id, showId);
  if (!show) return { ok: false, error: "Show not found." };
  if (!Number.isInteger(season) || !Number.isInteger(episode) || season < 0 || episode < 0 || season > 99 || episode > 999) {
    return { ok: false, error: "Season and episode must be whole numbers." };
  }
  const { episodeId, alreadyWatched } = await recordEpisode(user.id, show.id, season, episode, url);
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
    return { ok: false, error: "That's a folder or movie link. Paste the link to an episode file (…s02e01….mkv)." };
  }
  if (normalizeKey(parsed.showTitle) !== show.titleKey) {
    return { ok: false, error: `That link looks like “${parsed.showTitle}”, not ${show.title}.` };
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
