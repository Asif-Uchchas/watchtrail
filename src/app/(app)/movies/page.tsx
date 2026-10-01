import type { Metadata } from "next";
import { Film } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listMovies } from "@/lib/library";
import type { Movie } from "@/lib/schema";
import { AddLinkBar } from "@/components/add-link-bar";
import { MovieActions } from "@/components/show-actions";
import { CopyLinkButton, PlayButton } from "@/components/play";
import { EmptyState, Poster, SectionTitle, timeAgo } from "@/components/ui";

export const metadata: Metadata = { title: "Movies" };

export default async function MoviesPage() {
  const user = await requireUser();
  const all = await listMovies(user.id);
  const watchlist = all.filter((m) => !m.watched);
  const watched = all.filter((m) => m.watched);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-5xl leading-none tracking-tight">Movies</h1>
        <p className="mt-2 text-muted">
          {watched.length} watched{watchlist.length ? ` · ${watchlist.length} on your watchlist` : ""}
        </p>
        <div className="mt-6">
          <AddLinkBar />
        </div>
      </section>

      {all.length === 0 ? (
        <EmptyState icon={<Film className="size-5" />} title="No movies yet">
          Paste a movie link above. Choose <b className="text-ink">Watched it</b> to log it, or{" "}
          <b className="text-ink">Add to watchlist</b> to save it for later.
        </EmptyState>
      ) : null}

      {watchlist.length ? (
        <section>
          <SectionTitle>Watchlist</SectionTitle>
          <MovieGrid movies={watchlist} />
        </section>
      ) : null}

      {watched.length ? (
        <section>
          <SectionTitle>Watched</SectionTitle>
          <MovieGrid movies={watched} />
        </section>
      ) : null}
    </div>
  );
}

function MovieGrid({ movies }: { movies: Movie[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {movies.map((m, i) => (
        <li key={m.id} className="animate-rise flex flex-col" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
          <Poster title={m.title} src={m.posterUrl} label={m.year ? `${m.title} (${m.year})` : m.title} />
          <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug">{m.title}</h3>
          <p className="mb-2.5 text-[12px] text-muted">
            {[m.year, m.watched && m.watchedAt ? `watched ${timeAgo(m.watchedAt)}` : m.watched ? null : "to watch"]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-auto space-y-1.5">
            {m.url ? (
              <div className="flex gap-1.5">
                <PlayButton url={m.url} title={m.title} label="Play" size="sm" variant={m.watched ? "secondary" : "primary"} className="flex-1" />
                <CopyLinkButton url={m.url} size="sm" />
              </div>
            ) : null}
            <MovieActions movieId={m.id} watched={m.watched} />
          </div>
        </li>
      ))}
    </ul>
  );
}
