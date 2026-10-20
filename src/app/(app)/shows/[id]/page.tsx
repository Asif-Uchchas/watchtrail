import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ListVideo } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getSeasonRows, getShow, getShowDetail } from "@/lib/library";
import { formatClock, resumeStart } from "@/lib/time";
import { formatEpisode } from "@/lib/parse";
import { statusLabel } from "@/lib/constants";
import {
  ClearStoppedButton,
  DeleteShowButton,
  EditShowButton,
  EpisodeToggle,
  MarkWatchedButton,
  ProgressForm,
  RefreshInfoButton,
  SeasonClearButton,
  StarRating,
  StatusSelect,
  StoppedAtForm,
} from "@/components/show-actions";
import { CopyLinkButton, FolderButton, PlayButton } from "@/components/play";
import { EnablePlayForm } from "@/components/enable-play";
import { Poster, buttonClass, cx, timeAgo } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/shows/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const user = await requireUser();
  const show = await getShow(user.id, id);
  return { title: show?.title ?? "Show" };
}

export default async function ShowPage(props: PageProps<"/shows/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUser();
  const detail = await getShowDetail(user.id, id);
  if (!detail) notFound();
  const { show, episodes, seasons } = detail;

  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  const next =
    show.nextSeason !== null && show.nextEpisode !== null
      ? { season: show.nextSeason, episode: show.nextEpisode, label: formatEpisode(show.nextSeason, show.nextEpisode) }
      : null;

  const seasonNumbers = [
    ...new Set([...episodes.map((e) => e.season), ...(seasons ? Object.keys(seasons).map(Number) : [])]),
  ].sort((a, b) => a - b);
  const requested = Number(Array.isArray(sp.s) ? sp.s[0] : sp.s);
  const activeSeason = seasonNumbers.includes(requested)
    ? requested
    : (show.nextSeason ?? show.lastSeason ?? seasonNumbers[0] ?? 1);
  const rows = (await getSeasonRows(user.id, show.id, activeSeason)) ?? [];
  const watchedInSeason = rows.filter((r) => r.watched).length;
  const resumeEpisode = show.resumeSeconds
    ? episodes.find((e) => e.season === show.nextSeason && e.episode === show.nextEpisode)
    : undefined;
  const progressPct =
    show.totalEpisodes && show.totalEpisodes > 0
      ? Math.min(100, Math.round((episodes.length / show.totalEpisodes) * 100))
      : null;

  const meta = [
    show.year,
    show.seasonCount ? `${show.seasonCount} season${show.seasonCount > 1 ? "s" : ""}` : null,
    show.totalEpisodes ? `${show.totalEpisodes} episodes` : null,
    show.airStatus === "Returning Series" ? "Still airing" : show.airStatus === "Ended" ? "Ended" : null,
    statusLabel(show.status),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink">
          <ArrowLeft className="size-4" /> All shows
        </Link>

        <section className="flex gap-4 sm:gap-7">
          <div className="w-[84px] shrink-0 sm:w-36">
            <Poster title={show.title} src={show.posterUrl} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="text-[28px] font-semibold leading-[1.05] tracking-tight sm:text-[44px]">{show.title}</h1>
            <p className="mt-2 text-sm text-muted">{meta}</p>
            {show.badge ? (
              <p className={cx("mt-1.5 text-sm", show.badge.kind === "new" ? "text-accent" : "text-muted")}>{show.badge.text}</p>
            ) : null}

            {progressPct !== null ? (
              <div className="mt-5 max-w-md">
                <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="mt-2 font-mono text-[12px] text-muted">
                  {episodes.length} / {show.totalEpisodes} watched
                  {hasProgress ? (
                    <span suppressHydrationWarning>
                      {" "}
                      · last {formatEpisode(show.lastSeason!, show.lastEpisode!)} {timeAgo(show.lastWatchedAt)}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : hasProgress ? (
              <p className="mt-4 font-mono text-[12px] text-muted" suppressHydrationWarning>
                Last {formatEpisode(show.lastSeason!, show.lastEpisode!)} {timeAgo(show.lastWatchedAt)}
              </p>
            ) : null}

            {show.caughtUp ? (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
                <Check className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="text-sm">
                  <p className="font-medium text-ink">You&apos;re all caught up.</p>
                  <p className="mt-0.5 text-muted">
                    {show.airStatus === "Returning Series"
                      ? "New episodes are still coming. Use “Update episode list” when a new season lands."
                      : "That's every episode. Set the status to Finished to move it off your Watching list."}
                  </p>
                </div>
              </div>
            ) : show.status !== "completed" && next ? (
              <div className="mt-6">
                <div className="flex flex-wrap gap-2">
                  {show.nextUrl ? (
                    <>
                      <PlayButton
                        url={show.nextUrl}
                        title={`${show.title} ${next.label}`}
                        mark={{ showId: show.id, season: next.season, episode: next.episode }}
                        start={resumeStart(show.resumeSeconds)}
                        label={show.resumeSeconds ? `Resume ${next.label} at ${formatClock(show.resumeSeconds)}` : `Play ${next.label}`}
                        size="lg"
                      />
                      <CopyLinkButton url={show.nextUrl} size="lg" />
                      <span className="hidden sm:inline-flex">
                        <a
                          href={`/api/queue?show=${show.id}&n=5`}
                          title="Download a playlist of the next 5 episodes"
                          className={buttonClass("secondary", "lg")}
                        >
                          <ListVideo className="size-4" />
                          Queue 5
                        </a>
                        <a
                          href={`/api/queue?show=${show.id}&n=300`}
                          title="Download a playlist of every remaining episode (opens in VLC to stream, not a video download)"
                          className={`${buttonClass("secondary", "lg")} ml-2`}
                        >
                          Queue all
                        </a>
                      </span>
                    </>
                  ) : null}
                  {hasProgress ? (
                    <MarkWatchedButton
                      showId={show.id}
                      season={next.season}
                      episode={next.episode}
                      url={show.nextUrl}
                      size="lg"
                    />
                  ) : null}
                  {show.seasonFolderUrl ? (
                    <FolderButton url={show.seasonFolderUrl} label={hasProgress ? "Open folder" : "Show folder"} size="lg" />
                  ) : null}
                </div>
                {hasProgress && next.season !== show.lastSeason ? (
                  <p className="mt-2 text-[13px] text-muted">This starts a new season.</p>
                ) : null}
                {show.nextUrl && show.nextGuessed ? (
                  <p className="mt-2 max-w-xl text-[13px] text-muted">
                    This link is a guess from another episode&apos;s file name. If VLC can&apos;t open it, press{" "}
                    <strong>Open folder</strong> with the browser helper on: Watchtrail then learns the real file names and
                    Play works.
                  </p>
                ) : null}
                {!show.nextUrl ? (
                  <div className="mt-4">
                    <EnablePlayForm showId={show.id} title={show.title} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="grid gap-10 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[22px] font-semibold tracking-tight">Season {activeSeason}</h2>
            <p className="font-mono text-[13px] text-faint">
              {rows.length ? `${watchedInSeason} / ${rows.length} watched` : ""}
            </p>
          </div>

          {seasonNumbers.length > 1 ? (
            <nav aria-label="Seasons" className="no-scrollbar -mx-4 mt-3.5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {seasonNumbers.map((n) => (
                <Link
                  key={n}
                  href={`/shows/${show.id}?s=${n}`}
                  scroll={false}
                  aria-current={n === activeSeason ? "page" : undefined}
                  className={cx(
                    "inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border px-3 font-mono text-sm transition",
                    n === activeSeason
                      ? "border-ink bg-ink text-bg"
                      : "border-line-strong text-muted hover:text-ink",
                  )}
                >
                  {n}
                </Link>
              ))}
            </nav>
          ) : null}

          {rows.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-line-strong p-5 text-sm text-muted">
              No episode list yet. Play an episode from here, paste an episode link, or use <b className="text-ink">Set your place</b>{" "}
              to mark everything you&apos;ve already seen.
            </p>
          ) : (
            <ul className="mt-4">
              {rows.map((row) => {
                const isNext = activeSeason === show.nextSeason && row.episode === show.nextEpisode;
                const unaired = row.unaired;
                const seen = row.watched || isNext;
                return (
                  <li
                    key={row.episode}
                    className={cx("-mx-3.5 flex items-start gap-3 rounded-xl px-3.5 py-2.5", isNext && "bg-surface")}
                  >
                    <div className="pt-px">
                      <EpisodeToggle
                        showId={show.id}
                        season={activeSeason}
                        episode={row.episode}
                        episodeId={row.episodeId}
                        url={row.url}
                        isNext={isNext}
                      />
                    </div>
                    <span className="w-9 shrink-0 pt-1.5 font-mono text-[13px] text-faint">
                      E{String(row.episode).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <span className={cx("block truncate text-[15px]", row.watched ? "text-muted" : "text-ink")}>
                        {row.name ?? `Episode ${row.episode}`}
                      </span>
                      {row.resumeSeconds ? (
                        <span className="mt-0.5 flex items-center gap-3 font-mono text-[12px] text-accent">
                          stopped at {formatClock(row.resumeSeconds)}
                          {row.episodeId ? <ClearStoppedButton episodeId={row.episodeId} /> : null}
                        </span>
                      ) : null}
                      {seen && row.overview ? (
                        <details className="group mt-0.5">
                          <summary className="cursor-pointer list-none text-[12px] text-faint transition hover:text-muted [&::-webkit-details-marker]:hidden">
                            <span className="group-open:hidden">Summary</span>
                            <span className="hidden group-open:inline">Hide summary</span>
                          </summary>
                          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-muted">{row.overview}</p>
                        </details>
                      ) : null}
                    </div>
                    {row.runtime ? (
                      <span className="hidden shrink-0 pt-1.5 font-mono text-[13px] text-faint sm:block">{row.runtime} min</span>
                    ) : null}
                    {unaired ? (
                      <span className="shrink-0 pt-1.5 font-mono text-[12px] text-faint" suppressHydrationWarning>
                        {new Date(row.airDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      </span>
                    ) : row.url ? (
                      <PlayButton
                        url={row.url}
                        title={`${show.title} ${formatEpisode(activeSeason, row.episode)}`}
                        mark={{ showId: show.id, season: activeSeason, episode: row.episode }}
                        start={resumeStart(row.resumeSeconds)}
                        label={row.resumeSeconds ? "Resume" : "Play"}
                        size="sm"
                        variant="secondary"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {watchedInSeason > 0 ? (
            <div className="mt-2 flex justify-end">
              <SeasonClearButton showId={show.id} season={activeSeason} />
            </div>
          ) : null}
        </div>

        <aside className="space-y-8">
          <div>
            <h2 className="mb-1 text-[15px] font-semibold">Your rating</h2>
            <StarRating kind="show" id={show.id} value={show.rating} />
          </div>
          {next && !show.caughtUp ? (
            <div>
              <h2 className="text-[15px] font-semibold">Stopped partway?</h2>
              <p className="mb-3 mt-1.5 text-[13px] text-muted">
                Watched part of {next.label} on your phone? Enter the time and Play will resume 5 seconds before it.
              </p>
              <StoppedAtForm showId={show.id} season={next.season} episode={next.episode} label={`${next.label} stopped at`} />
              {resumeEpisode ? <span className="sr-only">Saved position for {next.label}</span> : null}
            </div>
          ) : null}
          <div>
            <h2 className="text-[15px] font-semibold">Set your place</h2>
            <p className="mb-4 mt-1.5 text-[13px] text-muted">
              Enter the last episode you finished. Watchtrail can mark everything before it too.
            </p>
            <ProgressForm
              showId={show.id}
              defaultSeason={show.lastSeason ?? 1}
              defaultEpisode={show.lastEpisode ?? 1}
              hasSeasonData={Boolean(seasons)}
            />
          </div>
          <div>
            <h2 className="mb-3 text-[15px] font-semibold">Manage</h2>
            <div className="flex flex-wrap items-center gap-2">
              <StatusSelect showId={show.id} status={show.status} />
              <EditShowButton showId={show.id} title={show.title} folderUrl={show.folderUrl} />
              {show.folderUrl && show.folderUrl !== show.seasonFolderUrl ? (
                <FolderButton url={show.folderUrl} label="All seasons" />
              ) : null}
              {show.tmdbId !== null ? <RefreshInfoButton showId={show.id} /> : null}
              <DeleteShowButton showId={show.id} title={show.title} />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
