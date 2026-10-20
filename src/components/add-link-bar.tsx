"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ClipboardPaste, Film, FolderOpen, Link2, Loader2, Tv } from "lucide-react";
import { addLink, addLinkManual } from "@/app/actions";
import { formatEpisode, parseMediaUrl } from "@/lib/parse";
import { Button, cx } from "./ui";
import { useActionToast } from "./use-action-toast";

export function AddLinkBar({
  defaultValue = "",
  autoFocus = false,
  goToResult = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  /** After saving, open the show/movies page (used by the share screen). */
  goToResult?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { run, pending } = useActionToast();
  const [naming, setNaming] = useState(false);

  const parsed = useMemo(() => (value.trim() ? parseMediaUrl(value) : null), [value]);

  const submit = (mode: "watched" | "track") => {
    if (!value.trim() || pending) return;
    void run(() => addLink(value, mode), {
      onSuccess: (r) => {
        setValue("");
        if (goToResult && r.href) router.push(r.href);
      },
    });
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setValue(text.trim());
    } catch {
      inputRef.current?.focus();
    }
  };

  const primary =
    parsed?.kind === "episode"
      ? { label: "Mark watched", mode: "watched" as const }
      : parsed?.kind === "movie"
        ? { label: "Watched it", mode: "watched" as const }
        : parsed?.kind === "show"
          ? { label: "Add show", mode: "track" as const }
          : { label: "Add", mode: "watched" as const };
  const secondary =
    parsed?.kind === "episode"
      ? { label: "Just track", mode: "track" as const }
      : parsed?.kind === "movie"
        ? { label: "Watchlist", mode: "track" as const }
        : null;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(primary.mode);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">Episode, movie or show folder link</span>
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus={autoFocus}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a link from your FTP server"
            className="h-12 w-full rounded-[10px] border border-line-strong bg-surface pl-10 pr-12 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-accent/70"
          />
          <button
            type="button"
            onClick={paste}
            title="Paste from clipboard"
            className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <ClipboardPaste className="size-4" />
            <span className="sr-only">Paste from clipboard</span>
          </button>
        </label>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={pending || !parsed || parsed.kind === "error"}
            className="h-12 flex-1 sm:min-w-36 sm:flex-none"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {primary.label}
          </Button>
          {secondary ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => submit(secondary.mode)}
              className="h-12 flex-1 sm:flex-none"
            >
              {secondary.label}
            </Button>
          ) : null}
        </div>
      </form>

      {value.trim() && parsed ? (
        <div className="mt-2 px-1 text-[13px]">
          <button
            type="button"
            onClick={() => setNaming((n) => !n)}
            className="text-muted underline-offset-2 transition hover:text-ink hover:underline"
          >
            {parsed.kind === "error" ? "Name this link yourself" : "Not the right title? Name it yourself"}
          </button>
        </div>
      ) : null}
      {naming && value.trim() ? (
        <ManualNaming
          url={value.trim()}
          onDone={(href) => {
            setValue("");
            setNaming(false);
            if (goToResult && href) router.push(href);
          }}
        />
      ) : null}

      {parsed ? (
        <div className="mt-3 flex min-h-6 items-center gap-2 px-1 text-[13px]">
          {parsed.kind === "error" ? (
            <span className="text-danger">{parsed.message}</span>
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-muted animate-rise">
              <KindIcon kind={parsed.kind} />
              {parsed.kind === "episode" ? (
                <>
                  <span className="truncate text-ink">{parsed.showTitle}</span>
                  <Pill>{formatEpisode(parsed.season, parsed.episode)}</Pill>
                </>
              ) : parsed.kind === "movie" ? (
                <>
                  <span className="truncate text-ink">{parsed.title}</span>
                  {parsed.year ? <Pill>{parsed.year}</Pill> : null}
                  <span className="text-faint">movie</span>
                </>
              ) : (
                <>
                  <span className="truncate text-ink">{parsed.showTitle}</span>
                  <span className="text-faint">show folder</span>
                </>
              )}
              {"quality" in parsed && parsed.quality ? <Pill muted>{parsed.quality}</Pill> : null}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * For links that say nothing about what they are (download/362003 style): the user types the
 * title, and we save the link against it.
 */
function ManualNaming({ url, onDone }: { url: string; onDone: (href?: string) => void }) {
  const { run, pending } = useActionToast();
  const [kind, setKind] = useState<"movie" | "episode">("movie");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");

  const num = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Math.trunc(Number(s)) : null);
  const save = (mode: "watched" | "track") => {
    if (pending) return;
    void run(
      () =>
        addLinkManual({
          url,
          title,
          kind,
          year: num(year),
          season: kind === "episode" ? num(season) : null,
          episode: kind === "episode" ? num(episode) : null,
          mode,
        }),
      { onSuccess: (r) => onDone(r.href) },
    );
  };
  const field =
    "h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none transition placeholder:text-faint focus:border-accent/70";

  return (
    <div className="mt-3 rounded-[12px] border border-line bg-surface-2 p-4 animate-rise">
      <p className="text-[13px] text-muted">
        Watchtrail can&apos;t read a title from this link, so tell it what it is. The link is saved with it and Play uses it as-is.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <div className="inline-flex rounded-[10px] border border-line-strong p-0.5" role="group" aria-label="Type">
          {(["movie", "episode"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-[13px] transition",
                kind === k ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
              )}
            >
              {k === "movie" ? "Movie" : "TV episode"}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "movie" ? "Title, e.g. The Odyssey" : "Show title, e.g. House"}
          aria-label="Title"
          className={cx(field, "min-w-48 flex-1")}
        />
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          inputMode="numeric"
          placeholder="Year"
          aria-label="Year (optional)"
          className={cx(field, "w-24")}
        />
        {kind === "episode" ? (
          <>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              inputMode="numeric"
              placeholder="Season"
              aria-label="Season"
              className={cx(field, "w-24")}
            />
            <input
              value={episode}
              onChange={(e) => setEpisode(e.target.value)}
              inputMode="numeric"
              placeholder="Episode"
              aria-label="Episode"
              className={cx(field, "w-24")}
            />
          </>
        ) : null}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="primary" disabled={pending || !title.trim()} onClick={() => save("watched")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {kind === "movie" ? "Watched it" : "Mark watched"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending || !title.trim()} onClick={() => save("track")}>
          {kind === "movie" ? "Watchlist" : "Just track"}
        </Button>
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: "episode" | "movie" | "show" }) {
  const Icon = kind === "episode" ? Tv : kind === "movie" ? Film : FolderOpen;
  return <Icon className="size-4 shrink-0 text-muted" aria-hidden />;
}

function Pill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cx(
        "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] tracking-wide",
        muted ? "bg-surface-3 text-muted" : "bg-surface-3 text-accent",
      )}
    >
      {children}
    </span>
  );
}
