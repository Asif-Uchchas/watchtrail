import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks, PartyPopper } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getShow, getShowDetail } from "@/lib/library";
import { formatEpisode } from "@/lib/parse";
import { statusLabel } from "@/lib/constants";
import {
  DeleteShowButton,
  EditShowButton,
  MarkWatchedButton,
  ProgressForm,
  RefreshInfoButton,
  RemoveEpisodeButton,
  SeasonClearButton,
  StatusSelect,
} from "@/components/show-actions";
import { CopyLinkButton, FolderButton, PlayButton } from "@/components/play";
import { EnablePlayForm } from "@/components/enable-play";
import { EmptyState, Poster, timeAgo } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/shows/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const user = await requireUser();
  const show = await getShow(user.id, id);
  return { title: show?.title ?? "Show" };
}

export default async function ShowPage(props: PageProps<"/shows/[id]">) {
  const { id } = await props.params;
  const user = await requireUser();
  const detail = await getShowDetail(user.id, id);
  if (!detail) notFound();
  const { show, episodes, seasons } = detail;

  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  const next =
    show.nextSeason !== null && show.nextEpisode !== null
      ? { season: show.nextSeason, episode: show.nextEpisode, label: formatEpisode(show.nextSeason, show.nextEpisode) }
      : null;

  const bySeason = new Map<number, typeof episodes>();
  for (const ep of episodes) {
    const list = bySeason.get(ep.season) ?? [];
    list.push(ep);
    bySeason.set(ep.season, list);
  }
  const seasonNumbers = [...new Set([...bySeason.keys(), ...(seasons ? Object.keys(seasons).map(Number) : [])])].sort(
    (a, b) => b - a,
  );
  const progressPct =
    show.totalEpisodes && show.totalEpisodes > 0
      ? Math.min(100, Math.round((episodes.length / show.totalEpisodes) * 100))
      : null;

  return (
    <div className="space-y-10">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink">
        <ArrowLeft className="size-4" /> All shows
      </Link>

      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface">
        {show.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- decorative blurred backdrop
          <img src={show.posterUrl} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-20 blur-3xl" />
        ) : null}
        <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:p-8">
          <div className="w-36 shrink-0 sm:w-44">
            <Poster title={show.title} src={show.posterUrl} className="shadow-2xl" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] uppercase tracking-[0.16em] text-faint">
              {[
                show.year,
                statusLabel(show.status),
                show.seasonCount ? `${show.seasonCount} season${show.seasonCount > 1 ? "s" : ""}` : null,
                show.airStatus === "Returning Series" ? "Still airing" : show.airStatus === "Ended" ? "Ended" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h1 className="mt-1 font-display text-5xl leading-[1.05] tracking-tight">{show.title}</h1>
            <p className="mt-2 text-muted">
              {hasProgress ? (
                <>
                  Last watched <span className="font-mono text-ink">{formatEpisode(show.lastSeason!, show.lastEpisode!)}</span>{" "}
                  {timeAgo(show.lastWatchedAt)}
                </>
              ) : (
                "You haven't logged an episode yet."
              )}
            </p>

            {progressPct !== null ? (
              <div className="mt-4 max-w-md">
                <div className="flex justify-between text-[12px] text-muted">
                  <span>
                    {episodes.length} of {show.totalEpisodes} episodes
                  </span>
                  <span className="font-mono">{progressPct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            ) : null}

            {show.caughtUp ? (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-success/25 bg-success/[0.06] p-4">
                <PartyPopper className="mt-0.5 size-5 shrink-0 text-success" />
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
              <div className="mt-6 rounded-2xl border border-line bg-bg/40 p-4">
                <p className="text-[12px] uppercase tracking-[0.14em] text-faint">
                  Up next <span className="font-mono normal-case tracking-normal text-accent">{next.label}</span>
                  {hasProgress && next.season !== show.lastSeason ? (
                    <span className="ml-2 normal-case tracking-normal text-muted">· new season</span>
                  ) : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {show.nextUrl ? (
                    <>
                      <PlayButton
                        url={show.nextUrl}
                        title={`${show.title} ${next.label}`}
                        mark={{ showId: show.id, season: next.season, episode: next.episode }}
                        label={`Play ${next.label}`}
                        size="lg"
                      />
                      <CopyLinkButton url={show.nextUrl} size="lg" />
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
                    <FolderButton url={show.seasonFolderUrl} label={hasProgress ? "Season folder" : "Show folder"} size="lg" />
                  ) : null}
                </div>
                {!show.nextUrl ? (
                  <div className="mt-4">
                    <EnablePlayForm showId={show.id} title={show.title} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <StatusSelect showId={show.id} status={show.status} />
              <EditShowButton showId={show.id} title={show.title} folderUrl={show.folderUrl} />
              {show.folderUrl && show.folderUrl !== show.seasonFolderUrl ? (
                <FolderButton url={show.folderUrl} label="All seasons" />
              ) : null}
              {show.tmdbId !== null ? <RefreshInfoButton showId={show.id} /> : null}
              <DeleteShowButton showId={show.id} title={show.title} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-4 font-display text-[28px] leading-none">Watch log</h2>
          {episodes.length === 0 ? (
            <EmptyState icon={<ListChecks className="size-5" />} title="Nothing logged yet">
              Play an episode from here, paste an episode link, or use <b className="text-ink">Set your place</b> to mark
              everything you&apos;ve already seen in one go.
            </EmptyState>
          ) : (
            <div className="space-y-6">
              {seasonNumbers.map((season) => {
                const list = bySeason.get(season) ?? [];
                const total = seasons?.[season] ?? null;
                const pct = total ? Math.min(100, Math.round((list.length / total) * 100)) : null;
                return (
                  <details key={season} open={season === show.lastSeason} className="group rounded-2xl border border-line bg-surface/60">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="text-sm font-semibold">Season {season}</span>
                      <span className="text-[13px] text-faint">
                        {total ? `${list.length}/${total}` : `${list.length} watched`}
                      </span>
                      {pct !== null ? (
                        <span className="ml-1 h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className={`block h-full rounded-full ${pct === 100 ? "bg-success" : "bg-accent"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      ) : (
                        <span className="flex-1" />
                      )}
                      <svg className="size-4 shrink-0 text-faint transition group-open:rotate-180" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    {list.length ? (
                      <>
                        <ul className="divide-y divide-line border-t border-line">
                          {[...list].reverse().map((ep) => (
                            <li key={ep.id} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="font-mono text-sm text-accent">{formatEpisode(ep.season, ep.episode)}</span>
                              <span className="flex-1 truncate text-[13px] text-muted">
                                {ep.backfilled ? "marked as seen" : timeAgo(ep.watchedAt)}
                              </span>
                              {ep.url ? (
                                <PlayButton
                                  url={ep.url}
                                  title={`${show.title} ${formatEpisode(ep.season, ep.episode)}`}
                                  label="Replay"
                                  size="sm"
                                  variant="secondary"
                                />
                              ) : null}
                              <RemoveEpisodeButton episodeId={ep.id} />
                            </li>
                          ))}
                        </ul>
                        <div className="flex justify-end border-t border-line px-2 py-1.5">
                          <SeasonClearButton showId={show.id} season={season} />
                        </div>
                      </>
                    ) : (
                      <p className="border-t border-line px-4 py-3 text-[13px] text-faint">Not started.</p>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-surface/60 p-5">
          <h2 className="font-display text-2xl leading-none">Set your place</h2>
          <p className="mb-4 mt-2 text-[13px] text-muted">
            Enter the last episode you finished. Watchtrail can mark everything before it too, so you can catch up
            your history in one go.
          </p>
          <ProgressForm
            showId={show.id}
            defaultSeason={show.lastSeason ?? 1}
            defaultEpisode={show.lastEpisode ?? 1}
            hasSeasonData={Boolean(seasons)}
          />
        </aside>
      </section>
    </div>
  );
}
