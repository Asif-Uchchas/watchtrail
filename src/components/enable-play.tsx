"use client";

import { useState } from "react";
import { Link2, Loader2, Play } from "lucide-react";
import { attachEpisodeLink } from "@/app/actions";
import { Button, inputClass } from "./ui";
import { useActionToast } from "./use-action-toast";

/**
 * Shown when a show has no episode file link yet (it was added from a folder,
 * or episodes were logged by number). One pasted episode link is enough for
 * Watchtrail to build Play links for every other episode.
 */
export function EnablePlayForm({ showId, title }: { showId: string; title: string }) {
  const [value, setValue] = useState("");
  const { run, pending } = useActionToast();

  return (
    <form
      id="enable-play"
      className="rounded-xl border border-accent/25 bg-accent/[0.06] p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        void run(() => attachEpisodeLink(showId, value), { onSuccess: () => setValue("") });
      }}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <Play className="size-3.5 fill-accent text-accent" />
        Turn on Play for {title}
      </p>
      <p className="mt-1 text-[13px] text-muted">
        Paste the link to <b className="text-ink">any one episode</b> of this show. Watchtrail copies its naming to
        build the link for every other episode. Nothing gets marked as watched.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Episode link</span>
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="http://…/Season 2 1080p/house.s02e01….mkv"
            className={`${inputClass} pl-10`}
          />
        </label>
        <Button type="submit" variant="primary" disabled={pending || !value.trim()} className="h-11">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Turn on Play
        </Button>
      </div>
    </form>
  );
}
