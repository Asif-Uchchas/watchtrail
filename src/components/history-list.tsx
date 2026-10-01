"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Film, Tv } from "lucide-react";
import type { HistoryItem } from "@/lib/library";
import { formatEpisode } from "@/lib/parse";
import { Poster } from "./ui";

// Dates are grouped and formatted in the viewer's own time zone, so this list
// renders on the client only (the server may run in UTC).
const subscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

function dayLabel(date: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function HistoryList({ items }: { items: HistoryItem[] }) {
  const isClient = useIsClient();
  if (!isClient) {
    return (
      <div className="space-y-2" aria-busy>
        {Array.from({ length: Math.min(items.length, 6) }, (_, i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface/60" />
        ))}
      </div>
    );
  }

  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(new Date(item.at));
    const group = groups.at(-1);
    if (group?.label === label) group.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="sticky top-16 z-10 -mx-1 mb-3 bg-bg/80 px-1 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-faint backdrop-blur">
            {group.label}
          </h2>
          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={`${item.type}-${item.id}`} className="animate-rise">
                <Row item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({ item }: { item: HistoryItem }) {
  const at = new Date(item.at);
  const inner = (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-2.5 pr-4 transition hover:border-line-strong hover:bg-surface">
      <div className="w-10 shrink-0">
        <Poster title={item.title} src={item.posterUrl} className="rounded-lg p-1.5 [&>span:first-child]:text-base [&>span:last-child]:hidden" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          {item.type === "episode" ? (
            <>
              <Tv className="size-3" />
              <span className="font-mono text-accent">{formatEpisode(item.season, item.episode)}</span>
            </>
          ) : (
            <>
              <Film className="size-3" /> Movie{item.year ? ` · ${item.year}` : ""}
            </>
          )}
        </p>
      </div>
      <time className="shrink-0 font-mono text-[12px] text-faint" dateTime={at.toISOString()}>
        {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </time>
    </div>
  );
  return <Link href={item.type === "episode" ? `/shows/${item.showId}` : "/movies"}>{inner}</Link>;
}
