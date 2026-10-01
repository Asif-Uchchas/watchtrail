import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getStats, listShows } from "@/lib/library";
import { formatEpisode } from "@/lib/parse";
import { AddLinkBar } from "@/components/add-link-bar";
import { ShowsBoard } from "@/components/shows-board";
import { MarkWatchedButton } from "@/components/show-actions";
import { CopyLinkButton, FolderButton, PlayButton } from "@/components/play";
import { EnablePlayForm } from "@/components/enable-play";
import { Poster, SectionTitle, timeAgo } from "@/components/ui";

export default async function HomePage() {
  const user = await requireUser();
  const [shows, stats] = await Promise.all([listShows(user.id), getStats(user.id)]);
  const upNext = shows.find((s) => s.status === "watching" && s.lastSeason !== null);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-10">
      <section>
        <p className="text-sm text-muted">Hi, {firstName}</p>
        <h1 className="mt-1 font-display text-[42px] leading-[1.05] tracking-tight sm:text-5xl">
          What are you <em className="text-accent">watching</em> tonight?
        </h1>
        <dl className="mt-4 flex gap-6 text-sm">
          <Stat label="episodes" value={stats.episodes} />
          <Stat label="shows" value={stats.shows} />
          <Stat label="movies" value={stats.movies} />
        </dl>
        <div className="mt-6">
          <AddLinkBar />
        </div>
      </section>

      {upNext ? (
        <section className="animate-rise">
          <SectionTitle>Continue watching</SectionTitle>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface">
            {upNext.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- decorative blurred backdrop
              <img src={upNext.posterUrl} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-2xl" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/90 to-surface/40" />
            <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
              <Link href={`/shows/${upNext.id}`} className="w-28 shrink-0 sm:w-32">
                <Poster title={upNext.title} src={upNext.posterUrl} className="shadow-2xl" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] uppercase tracking-[0.16em] text-faint">
                  Watched {formatEpisode(upNext.lastSeason!, upNext.lastEpisode!)} · {timeAgo(upNext.lastWatchedAt)}
                </p>
                <Link href={`/shows/${upNext.id}`} className="group mt-1 inline-flex items-center gap-2">
                  <h2 className="font-display text-4xl leading-tight group-hover:text-accent">{upNext.title}</h2>
                  <ArrowRight className="size-5 text-faint transition group-hover:translate-x-1 group-hover:text-accent" />
                </Link>
                <p className="mt-1 text-muted">
                  Next up: <span className="font-mono text-accent">{upNext.nextLabel}</span>
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {upNext.nextUrl ? (
                    <>
                      <PlayButton
                        url={upNext.nextUrl}
                        title={`${upNext.title} ${upNext.nextLabel}`}
                        mark={{ showId: upNext.id, season: upNext.lastSeason!, episode: upNext.lastEpisode! + 1 }}
                        label={`Play ${upNext.nextLabel}`}
                        size="lg"
                      />
                      <CopyLinkButton url={upNext.nextUrl} size="lg" />
                    </>
                  ) : null}
                  <MarkWatchedButton
                    showId={upNext.id}
                    season={upNext.lastSeason!}
                    episode={upNext.lastEpisode! + 1}
                    url={upNext.nextUrl}
                    size="lg"
                  />
                  {upNext.seasonFolderUrl ? (
                    <FolderButton url={upNext.seasonFolderUrl} label="Season folder" size="lg" />
                  ) : null}
                </div>
                {upNext.nextUrl ? (
                  <p className="mt-3 text-xs text-faint">
                    Play opens VLC and logs the episode. If that file doesn&apos;t exist (end of a season), open the folder instead.
                  </p>
                ) : (
                  <div className="mt-4 max-w-2xl">
                    <EnablePlayForm showId={upNext.id} title={upNext.title} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>Your shows</SectionTitle>
        <ShowsBoard shows={shows} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="font-mono text-lg text-ink">{value.toLocaleString()}</dd>
      <span className="text-muted">{label}</span>
    </div>
  );
}
