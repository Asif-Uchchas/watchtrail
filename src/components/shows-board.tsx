"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Tv } from "lucide-react";
import type { ShowCard } from "@/lib/library";
import type { ShowStatus } from "@/lib/schema";
import { STATUSES } from "@/lib/constants";
import { formatEpisode } from "@/lib/parse";
import { MarkWatchedButton } from "./show-actions";
import { FolderButton, PlayButton } from "./play";
import { EmptyState, Poster, cx } from "./ui";
import { formatClock, resumeStart } from "@/lib/time";

type Filter = ShowStatus | "all";

export function ShowsBoard({ shows }: { shows: ShowCard[] }) {
  const [filter, setFilter] = useState<Filter>("watching");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: shows.length, watching: 0, paused: 0, completed: 0, dropped: 0 };
    for (const s of shows) c[s.status]++;
    return c;
  }, [shows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shows.filter(
      (s) => (filter === "all" || s.status === filter) && (!q || s.title.toLowerCase().includes(q)),
    );
  }, [shows, filter, query]);

  const tabs: { value: Filter; label: string }[] = [...STATUSES, { value: "all", label: "All" }];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={filter === t.value}
              onClick={() => setFilter(t.value)}
              className={cx(
                "flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-sm transition",
                filter === t.value
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              <span className="text-[12px] text-faint">{counts[t.value]}</span>
            </button>
          ))}
        </div>
        {shows.length > 6 ? (
          <label className="relative mb-1 sm:w-56">
            <span className="sr-only">Search shows</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60"
            />
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Tv className="size-5" />} title={shows.length === 0 ? "No shows yet" : "Nothing here"}>
            {shows.length === 0
              ? "Paste an episode link above and it will show up here with a button for the next episode."
              : query
                ? `No shows match “${query}”.`
                : "No shows with this status."}
          </EmptyState>
        </div>
      ) : (
        <ul className="border-t border-line">
          {visible.map((show) => (
            <li key={show.id} className="border-b border-line">
              <ShowRow show={show} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShowRow({ show }: { show: ShowCard }) {
  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  const nextSeason = show.nextSeason ?? 1;
  const nextEpisode = show.nextEpisode ?? 1;
  const finished = show.caughtUp || show.status === "completed";
  const pct = show.totalEpisodes ? Math.min(100, Math.round((show.watchedCount / show.totalEpisodes) * 100)) : null;

  return (
    <div className="flex items-center gap-4 py-3.5">
      <Link href={`/shows/${show.id}`} className="w-11 shrink-0" tabIndex={-1} aria-hidden>
        <Poster title={show.title} src={show.posterUrl} className="rounded-[5px]" />
      </Link>

      <Link href={`/shows/${show.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{show.title}</span>
        <span className="mt-0.5 block font-mono text-[13px] text-muted">
          {finished ? (
            <span className="text-success">{show.caughtUp ? "Caught up" : "Finished"}</span>
          ) : hasProgress ? (
            <>
              {show.resumeSeconds ? `Resume ${show.nextLabel} at ${formatClock(show.resumeSeconds)}` : `Next ${show.nextLabel ?? "S01E01"}`}
            </>
          ) : (
            "Not started"
          )}
        </span>
        {show.badge ? (
          <span className={cx("mt-1 block text-[12px]", show.badge.kind === "new" ? "text-accent" : "text-faint")}>
            {show.badge.text}
          </span>
        ) : null}
      </Link>

      <div className="hidden w-36 shrink-0 sm:block">
        {pct !== null ? (
          <div title={`${show.watchedCount} of ${show.totalEpisodes} episodes`}>
            <div className="h-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cx("h-full rounded-full", finished ? "bg-faint" : "bg-accent")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="mt-1.5 block font-mono text-[12px] text-faint">
              {show.watchedCount} / {show.totalEpisodes}
            </span>
          </div>
        ) : (
          <span className="font-mono text-[12px] text-faint">{show.watchedCount} watched</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {finished ? null : show.nextUrl ? (
          <PlayButton
            url={show.nextUrl}
            title={`${show.title} ${formatEpisode(nextSeason, nextEpisode)}`}
            mark={{ showId: show.id, season: nextSeason, episode: nextEpisode }}
            start={resumeStart(show.resumeSeconds)}
            label={show.resumeSeconds ? "Resume" : "Play"}
            size="md"
            variant="secondary"
          />
        ) : hasProgress ? (
          <MarkWatchedButton
            showId={show.id}
            season={nextSeason}
            episode={nextEpisode}
            url={show.nextUrl}
            label="Mark"
            size="md"
          />
        ) : (
          <Link
            href={`/shows/${show.id}#enable-play`}
            className="text-[13px] text-accent hover:text-accent-strong"
          >
            Set up
          </Link>
        )}
        {!finished && show.nextUrl && show.seasonFolderUrl ? (
          <span className="hidden sm:inline-flex">
            <FolderButton url={show.seasonFolderUrl} size="md" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
