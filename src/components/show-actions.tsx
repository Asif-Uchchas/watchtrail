"use client";

import { Check, Loader2, Pencil, RefreshCw, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  clearSeasonLog,
  editShow,
  logProgress,
  markEpisode,
  refreshShowInfo,
  removeMovie,
  removeShow,
  toggleMovie,
  unmarkEpisode,
} from "@/app/actions";
import { STATUSES } from "@/lib/constants";
import type { ShowStatus } from "@/lib/schema";
import { Button, buttonClass, iconButtonClass, inputClass } from "./ui";
import { useActionToast } from "./use-action-toast";

export function MarkWatchedButton({
  showId,
  season,
  episode,
  url,
  label = "Mark watched",
  size = "md",
  className,
}: {
  showId: string;
  season: number;
  episode: number;
  url: string | null;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { run, pending } = useActionToast();
  return (
    <Button
      type="button"
      size={size}
      variant="secondary"
      disabled={pending}
      className={className}
      onClick={() => run(() => markEpisode(showId, season, episode, url))}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      {label}
    </Button>
  );
}

export function StatusSelect({ showId, status }: { showId: string; status: ShowStatus }) {
  const { run, pending } = useActionToast();
  return (
    <label className="relative inline-flex">
      <span className="sr-only">Status</span>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => run(() => editShow(showId, { status: e.target.value as ShowStatus }))}
        className="h-10 appearance-none rounded-xl border border-line bg-surface-2 pl-3.5 pr-9 text-sm text-ink outline-none transition hover:border-line-strong focus:border-accent/70"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

export function ProgressForm({
  showId,
  defaultSeason,
  defaultEpisode,
  hasSeasonData,
}: {
  showId: string;
  defaultSeason: number;
  defaultEpisode: number;
  hasSeasonData: boolean;
}) {
  const { run, pending } = useActionToast();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const season = Number(data.get("season"));
        const episode = Number(data.get("episode"));
        const includeEarlier = data.get("earlier") === "on";
        void run(() => logProgress(showId, season, episode, includeEarlier));
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-24">
          <span className="mb-1.5 block text-xs text-muted">Season</span>
          <input name="season" type="number" min={1} max={99} required defaultValue={defaultSeason} className={inputClass} />
        </label>
        <label className="w-24">
          <span className="mb-1.5 block text-xs text-muted">Episode</span>
          <input name="episode" type="number" min={1} max={999} required defaultValue={defaultEpisode} className={inputClass} />
        </label>
        <Button type="submit" variant="secondary" size="md" disabled={pending} className="h-11">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Log it
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-muted">
        <input name="earlier" type="checkbox" defaultChecked className="mt-0.5 size-4 shrink-0 accent-[#f5b544]" />
        <span>
          Also mark <b className="text-ink">every earlier episode</b> as watched
          {hasSeasonData ? null : (
            <span className="block text-faint">
              Without TMDB data only this season can be filled; earlier seasons need their last episode logged.
            </span>
          )}
        </span>
      </label>
    </form>
  );
}

export function SeasonClearButton({ showId, season }: { showId: string; season: number }) {
  const { run, pending } = useActionToast();
  const { armed, arm } = useConfirm();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => (armed ? run(() => clearSeasonLog(showId, season)) : arm())}
      className={armed ? buttonClass("danger", "sm") : buttonClass("ghost", "sm", "text-faint")}
    >
      {armed ? "Clear the whole season?" : "Clear season"}
    </button>
  );
}

export function RefreshInfoButton({ showId }: { showId: string }) {
  const { run, pending } = useActionToast();
  return (
    <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => refreshShowInfo(showId))}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      Update episode list
    </Button>
  );
}

export function RemoveEpisodeButton({ episodeId }: { episodeId: string }) {
  const { run, pending } = useActionToast();
  return (
    <button
      type="button"
      title="Remove from history"
      disabled={pending}
      onClick={() => run(() => unmarkEpisode(episodeId))}
      className="grid size-8 place-items-center rounded-lg text-faint opacity-60 transition hover:bg-danger/10 hover:text-danger hover:opacity-100 disabled:opacity-30"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      <span className="sr-only">Remove</span>
    </button>
  );
}

export function EditShowButton({
  showId,
  title,
  folderUrl,
}: {
  showId: string;
  title: string;
  folderUrl: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { run, pending } = useActionToast();
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => dialogRef.current?.showModal()}>
        <Pencil className="size-4" />
        Edit
      </Button>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(92vw,440px)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void run(
              () =>
                editShow(showId, {
                  title: String(data.get("title") ?? ""),
                  folderUrl: String(data.get("folderUrl") ?? ""),
                }),
              { onSuccess: () => dialogRef.current?.close() },
            );
          }}
        >
          <h2 className="font-display text-3xl">Edit show</h2>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Title</span>
            <input name="title" defaultValue={title} required maxLength={120} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Show folder link</span>
            <input name="folderUrl" defaultValue={folderUrl ?? ""} placeholder="http://…/House (TV Series 2004-2012)/" className={inputClass} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Two-step delete: first click arms it, second click deletes. */
function useConfirm(timeout = 3000) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), timeout);
    return () => clearTimeout(t);
  }, [armed, timeout]);
  return { armed, arm: () => setArmed(true) };
}

export function DeleteShowButton({ showId, title }: { showId: string; title: string }) {
  const { armed, arm } = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={armed ? "danger" : "ghost"}
      disabled={pending}
      onClick={() => {
        if (!armed) return arm();
        start(async () => {
          toast(`Deleted ${title}.`);
          await removeShow(showId);
        });
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      {armed ? "Click again to delete" : "Delete"}
    </Button>
  );
}

export function MovieActions({ movieId, watched }: { movieId: string; watched: boolean }) {
  const { run, pending } = useActionToast();
  const { armed, arm } = useConfirm();
  return (
    <div className="flex gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        className="flex-1"
        onClick={() => run(() => toggleMovie(movieId, !watched))}
      >
        {watched ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
        {watched ? "Unwatch" : "Watched"}
      </Button>
      <button
        type="button"
        disabled={pending}
        title="Remove movie"
        className={armed ? buttonClass("danger", "sm") : iconButtonClass("ghost", "sm")}
        onClick={() => (armed ? run(() => removeMovie(movieId)) : arm())}
      >
        <Trash2 className="size-3.5" />
        {armed ? "Sure?" : <span className="sr-only">Remove</span>}
      </button>
    </div>
  );
}
