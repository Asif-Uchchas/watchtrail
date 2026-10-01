import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getShow, getShowDetail } from "@/lib/library";
import { formatEpisode } from "@/lib/parse";
import { statusLabel } from "@/lib/constants";
import {
  DeleteShowButton,
  EditShowButton,
  MarkWatchedButton,
  ProgressForm,
  RemoveEpisodeButton,
  StatusSelect,
} from "@/components/show-actions";
import { CopyLinkButton, FolderButton, PlayButton } from "@/components/play";
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
  const { show, episodes } = detail;

  const hasProgress = show.lastSeason !== null && show.lastEpisode !== null;
  const nextSeason = show.lastSeason ?? 1;
  const nextEpisode = (show.lastEpisode ?? 0) + 1;

  const bySeason = new Map<number, typeof episodes>();
  for (const ep of episodes) {
    const list = bySeason.get(ep.season) ?? [];
    list.push(ep);
    bySeason.set(ep.season, list);
  }
  const seasons = [...bySeason.entries()].sort((a, b) => b[0] - a[0]);

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
              {[show.year, statusLabel(show.status), `${episodes.length} watched`].filter(Boolean).join(" · ")}
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

            {show.status !== "completed" ? (
              <div className="mt-6 rounded-2xl border border-line bg-bg/40 p-4">
                <p className="text-[12px] uppercase tracking-[0.14em] text-faint">
                  Up next <span className="font-mono normal-case tracking-normal text-accent">{formatEpisode(nextSeason, nextEpisode)}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {show.nextUrl ? (
                    <>
                      <PlayButton
                        url={show.nextUrl}
                        title={`${show.title} ${formatEpisode(nextSeason, nextEpisode)}`}
                        mark={{ showId: show.id, season: nextSeason, episode: nextEpisode }}
                        label={`Play ${formatEpisode(nextSeason, nextEpisode)}`}
                        size="lg"
                      />
                      <CopyLinkButton url={show.nextUrl} size="lg" />
                    </>
                  ) : null}
                  {hasProgress ? (
                    <MarkWatchedButton
                      showId={show.id}
                      season={nextSeason}
                      episode={nextEpisode}
                      url={show.nextUrl}
                      size="lg"
                    />
                  ) : null}
                  {show.seasonFolderUrl ? (
                    <FolderButton url={show.seasonFolderUrl} label={hasProgress ? "Season folder" : "Show folder"} size="lg" />
                  ) : null}
                </div>
                {!show.nextUrl ? (
                  <p className="mt-3 text-xs text-faint">
                    Paste an episode link on the home screen and Watchtrail will work out the next one from it.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <StatusSelect showId={show.id} status={show.status} />
              <EditShowButton showId={show.id} title={show.title} folderUrl={show.folderUrl} />
              {show.folderUrl && show.folderUrl !== show.seasonFolderUrl ? (
                <FolderButton url={show.folderUrl} label="All seasons" />
              ) : null}
              <DeleteShowButton showId={show.id} title={show.title} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-4 font-display text-[28px] leading-none">Watch log</h2>
          {seasons.length === 0 ? (
            <EmptyState icon={<ListChecks className="size-5" />} title="Nothing logged yet">
              Play an episode from here, paste an episode link, or set where you are with the form.
            </EmptyState>
          ) : (
            <div className="space-y-6">
              {seasons.map(([season, list]) => (
                <div key={season}>
                  <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                    Season {season}
                    <span className="font-normal text-faint">{list.length} episodes</span>
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface/60">
                    {[...list].reverse().map((ep) => (
                      <li key={ep.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="font-mono text-sm text-accent">{formatEpisode(ep.season, ep.episode)}</span>
                        <span className="flex-1 truncate text-[13px] text-muted">{timeAgo(ep.watchedAt)}</span>
                        {ep.url ? (
                          <PlayButton url={ep.url} title={`${show.title} ${formatEpisode(ep.season, ep.episode)}`} label="Replay" size="sm" variant="secondary" />
                        ) : null}
                        <RemoveEpisodeButton episodeId={ep.id} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-surface/60 p-5">
          <h2 className="font-display text-2xl leading-none">Set your place</h2>
          <p className="mb-4 mt-2 text-[13px] text-muted">
            Already partway through? Log the last episode you finished and Watchtrail picks up from there.
          </p>
          <ProgressForm showId={show.id} defaultSeason={show.lastSeason ?? 1} defaultEpisode={show.lastEpisode ?? 1} />
        </aside>
      </section>
    </div>
  );
}
