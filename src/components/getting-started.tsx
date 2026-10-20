"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";

const KEY = "wt-getting-started-dismissed";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
// Hidden until we know: the server render and first client render both say "hidden", so they agree.
const readDismissed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** A short first-run checklist for new users. Dismissal is remembered in this browser only. */
export function GettingStarted({ hasShows }: { hasShows: boolean }) {
  const hidden = useSyncExternalStore(subscribe, readDismissed, () => true);

  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: it will just show again next visit */
    }
    listeners.forEach((fn) => fn());
  };

  const steps: { done: boolean; title: string; body: React.ReactNode }[] = [
    {
      done: hasShows,
      title: "Add your first show or movie",
      body: "Paste a link from your FTP server into the box above. Watchtrail reads the title, season and episode for you.",
    },
    {
      done: false,
      title: "Install the browser helper",
      body: (
        <>
          It marks watched files right in the FTP listing and learns real file names.{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Open Settings
          </Link>
          .
        </>
      ),
    },
    {
      done: false,
      title: "Connect VLC on your PC (optional)",
      body: (
        <>
          Saves where you stopped automatically. Windows, Mac and Linux are supported; see{" "}
          <a
            href="https://github.com/Asif-Uchchas/watchtrail/blob/main/docs/VLC-BRIDGE.md"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            the guide
          </a>
          .
        </>
      ),
    },
  ];

  return (
    <section className="relative rounded-2xl border border-line bg-surface p-5 animate-rise" aria-label="Getting started">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-4" />
        <span className="sr-only">Dismiss getting started</span>
      </button>
      <h2 className="text-[17px] font-semibold tracking-tight">Getting started</h2>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span
              className={
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] " +
                (s.done ? "bg-accent text-black" : "border border-line-strong text-muted")
              }
            >
              {s.done ? <Check className="size-3" /> : i + 1}
            </span>
            <div>
              <p className="text-[14px] text-ink">{s.title}</p>
              <p className="text-[13px] text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}