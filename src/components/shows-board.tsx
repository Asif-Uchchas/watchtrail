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
import { EmptyState, Poster, cx, timeAgo } from "./ui";

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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={filter === t.value}
              onClick={() => setFilter(t.value)}
              className={cx(
                "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition",
                filter === t.value ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {t.label}
              <span className={cx("font-mono text-[11px]", filter === t.value ? "text-bg/60" : "text-faint")}>
                {counts[t.value]}
              </span>
            </button>
          ))}
        </div>
        {shows.length > 4 ? (
          <label className="relative sm:w-64">
            <span className="sr-only">Search shows</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shows"
              className="h-9 w-full rounded-full border border-line bg-surface-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60"
            />
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<Tv className="size-5" />} title={shows.length === 0 ? "No shows yet" : "Nothing here"}>
          {shows.length === 0
            ? "Paste an episode link above and it'll show up here with a button for the next episode."
            : query
              ? `No shows match “${query}”.`
              : "No shows with this status."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((show, i) => (
            <li key={show.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <ShowTile show={show} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShowTile({ show }: { show: ShowCard }) {
  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  const nextSeason = show.lastSeason ?? 1;
  const nextEpisode = (show.lastEpisode ?? 0) + 1;
  return (
    <article className="group flex h-full gap-4 rounded-2xl border border-line bg-surface/70 p-3 transition hover:border-line-strong hover:bg-surface">
      <Link href={`/shows/${show.id}`} className="w-[84px] shrink-0">
        <Poster title={show.title} src={show.posterUrl} className="transition group-hover:brightness-110" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/shows/${show.id}`} className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold leading-snug hover:text-accent">{show.title}</h3>
        </Link>
        <p className="mt-0.5 text-[13px] text-muted" suppressHydrationWarning>
          {hasProgress ? (
            <>
              Last <span className="font-mono text-ink">{formatEpisode(show.lastSeason!, show.lastEpisode!)}</span>
              {show.lastWatchedAt ? <> · {timeAgo(show.lastWatchedAt)}</> : null}
            </>
          ) : (
            "Not started"
          )}
        </p>

        <div className="mt-auto pt-3">
          {show.status === "completed" ? (
            <p className="text-[13px] text-success">Finished · {show.watchedCount} episodes</p>
          ) : (
            <>
              <p className="mb-2 text-[12px] uppercase tracking-[0.12em] text-faint">
                Up next <span className="font-mono normal-case tracking-normal text-accent">{show.nextLabel ?? "S01E01"}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {show.nextUrl ? (
                  <PlayButton
                    url={show.nextUrl}
                    title={`${show.title} ${formatEpisode(nextSeason, nextEpisode)}`}
                    mark={{ showId: show.id, season: nextSeason, episode: nextEpisode }}
                    label="Play next"
                    size="sm"
                  />
                ) : null}
                {hasProgress ? (
                  <MarkWatchedButton
                    showId={show.id}
                    season={nextSeason}
                    episode={nextEpisode}
                    url={show.nextUrl}
                    label={show.nextUrl ? "Mark" : "Mark watched"}
                    size="sm"
                  />
                ) : null}
                {show.seasonFolderUrl ? (
                  <FolderButton url={show.seasonFolderUrl} size="sm" />
                ) : null}
              </div>
              {!show.nextUrl ? (
                <Link
                  href={`/shows/${show.id}#enable-play`}
                  className="mt-2 inline-block text-[12px] text-accent hover:text-accent-strong"
                >
                  Turn on Play →
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
