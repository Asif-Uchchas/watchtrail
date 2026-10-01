"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ClipboardPaste, Film, FolderOpen, Link2, Loader2, Tv } from "lucide-react";
import { addLink } from "@/app/actions";
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
      ? { label: "Just add the show", mode: "track" as const }
      : parsed?.kind === "movie"
        ? { label: "Add to watchlist", mode: "track" as const }
        : null;

  return (
    <div className="rounded-2xl border border-line bg-surface/80 p-3 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.8)] backdrop-blur sm:p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(primary.mode);
        }}
        className="flex flex-col gap-3 sm:flex-row"
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
            placeholder="Paste the link you'd open in VLC…"
            className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-12 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-accent/70 focus:bg-surface-3 focus:ring-4 focus:ring-accent/10"
          />
          <button
            type="button"
            onClick={paste}
            title="Paste from clipboard"
            className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-ink"
          >
            <ClipboardPaste className="size-4" />
          </button>
        </label>
        <div className="flex gap-2">
          {secondary ? (
            <Button
              type="button"
              size="lg"
              variant="secondary"
              disabled={pending}
              onClick={() => submit(secondary.mode)}
              className="flex-1 sm:flex-none"
            >
              {secondary.label}
            </Button>
          ) : null}
          <Button
            type="submit"
            size="lg"
            variant="primary"
            disabled={pending || !parsed || parsed.kind === "error"}
            className="flex-1 sm:flex-none sm:min-w-36"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {primary.label}
          </Button>
        </div>
      </form>

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
      ) : (
        <p className="mt-3 px-1 text-[13px] text-faint">
          Works with episode links, movie links and show folders from Circle FTP or any file server.
        </p>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: "episode" | "movie" | "show" }) {
  const Icon = kind === "episode" ? Tv : kind === "movie" ? Film : FolderOpen;
  return <Icon className="size-4 shrink-0 text-accent" aria-hidden />;
}

function Pill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cx(
        "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] tracking-wide",
        muted ? "bg-surface-3 text-muted" : "bg-accent/15 text-accent",
      )}
    >
      {children}
    </span>
  );
}
