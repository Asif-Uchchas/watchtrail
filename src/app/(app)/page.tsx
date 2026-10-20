import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listShows } from "@/lib/library";
import { formatEpisode } from "@/lib/parse";
import { AddLinkBar } from "@/components/add-link-bar";
import { GettingStarted } from "@/components/getting-started";
import { ShowsBoard } from "@/components/shows-board";
import { MarkWatchedButton } from "@/components/show-actions";
import { CopyLinkButton, FolderButton, PlayButton } from "@/components/play";
import { EnablePlayForm } from "@/components/enable-play";
import { Poster, SectionTitle, timeAgo } from "@/components/ui";
import { formatClock, resumeStart } from "@/lib/time";

export default async function HomePage() {
  const user = await requireUser();
  const shows = await listShows(user.id);
  const upNext = shows.find((s) => s.status === "watching" && s.lastSeason !== null && !s.caughtUp && s.nextSeason !== null);
  const pct =
    upNext?.totalEpisodes && upNext.totalEpisodes > 0
      ? Math.min(100, Math.round((upNext.watchedCount / upNext.totalEpisodes) * 100))
      : null;

  return (
    <div className="space-y-12">
      <AddLinkBar />
      {shows.length < 3 ? <GettingStarted hasShows={shows.length > 0} /> : null}

      {upNext ? (
        <section className="animate-rise">
          <SectionTitle>Continue watching</SectionTitle>
          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:gap-6">
            <Link href={`/shows/${upNext.id}`} className="w-24 shrink-0 sm:w-28">
              <Poster title={upNext.title} src={upNext.posterUrl} />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="font-mono text-[13px] text-accent">
                {upNext.nextLabel}
                {upNext.resumeSeconds ? ` \u00b7 stopped at ${formatClock(upNext.resumeSeconds)}` : ""}
                {upNext.badge ? ` \u00b7 ${upNext.badge.text}` : ""}
              </p>
              <Link href={`/shows/${upNext.id}`}>
                <h2 className="mt-1 text-[34px] font-semibold leading-[1.1] tracking-tight hover:text-accent sm:text-[38px]">
                  {upNext.title}
                </h2>
              </Link>
              <p className="mt-1.5 text-sm text-muted" suppressHydrationWarning>
                Watched {formatEpisode(upNext.lastSeason!, upNext.lastEpisode!)} · {timeAgo(upNext.lastWatchedAt)}
              </p>
              {pct !== null ? (
                <div className="mt-4 max-w-sm">
                  <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 font-mono text-[12px] text-muted">
                    {upNext.watchedCount} / {upNext.totalEpisodes} episodes
                  </p>
                </div>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                {upNext.nextUrl ? (
                  <>
                    <PlayButton
                      url={upNext.nextUrl}
                      title={`${upNext.title} ${upNext.nextLabel}`}
                      mark={{ showId: upNext.id, season: upNext.nextSeason!, episode: upNext.nextEpisode! }}
                      start={resumeStart(upNext.resumeSeconds)}
                      label={upNext.resumeSeconds ? `Resume ${upNext.nextLabel}` : `Play ${upNext.nextLabel}`}
                      size="lg"
                    />
                    <CopyLinkButton url={upNext.nextUrl} size="lg" />
                  </>
                ) : null}
                <MarkWatchedButton
                  showId={upNext.id}
                  season={upNext.nextSeason!}
                  episode={upNext.nextEpisode!}
                  url={upNext.nextUrl}
                  size="lg"
                />
                {upNext.seasonFolderUrl ? <FolderButton url={upNext.seasonFolderUrl} size="lg" /> : null}
              </div>
            </div>
          </div>
          {!upNext.nextUrl ? (
            <div className="mt-3">
              <EnablePlayForm showId={upNext.id} title={upNext.title} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-1 text-[22px] font-semibold tracking-tight">Your shows</h2>
        <ShowsBoard shows={shows} />
      </section>
    </div>
  );
}
