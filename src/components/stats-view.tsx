"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Flame, Hourglass, Clapperboard, Tv } from "lucide-react";
import { Poster, cx } from "./ui";

type Props = {
  episodes: number;
  movies: number;
  shows: number;
  minutes: number;
  activity: number[];
  topShows: { id: string; title: string; posterUrl: string | null; episodes: number; minutes: number }[];
};

const noopSubscribe = () => () => {};
// Changes at most once an hour; 0 on the server so time-zone dependent parts render only in the browser.
const hourNow = () => Math.floor(Date.now() / 3_600_000) * 3_600_000;

function dayKey(d: Date) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function formatDuration(minutes: number) {
  const h = Math.round(minutes / 60);
  if (h < 48) return { big: String(h), unit: h === 1 ? "hour" : "hours" };
  const d = Math.round((minutes / 60 / 24) * 10) / 10;
  return { big: String(d), unit: "days of footage" };
}

export function StatsView({ stats }: { stats: Props }) {
  const now = useSyncExternalStore(noopSubscribe, hourNow, () => 0);
  const computed = useMemo(() => {
    if (!now) return null;
    const today = new Date(now);
    const counts = new Map<number, number>();
    for (const t of stats.activity) {
      const k = dayKey(new Date(t));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    // Streak: consecutive days with activity, ending today (or yesterday if nothing yet today).
    const cursor = new Date(today);
    if (!counts.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (counts.has(dayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    // 12-week heatmap, weeks start on Monday, last column contains today.
    const weeks = 12;
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
    const cells: { key: number; count: number; future: boolean; label: string }[] = [];
    const walker = new Date(start);
    for (let i = 0; i < weeks * 7; i++) {
      const k = dayKey(walker);
      cells.push({
        key: k,
        count: counts.get(k) ?? 0,
        future: walker.getTime() > today.getTime(),
        label: walker.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      });
      walker.setDate(walker.getDate() + 1);
    }

    // Last 6 months.
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      months.push({
        label: m.toLocaleDateString(undefined, { month: "short" }),
        count: stats.activity.filter((t) => t >= m.getTime() && t < next.getTime()).length,
      });
    }
    const last30 = stats.activity.filter((t) => t > now - 30 * 86_400_000).length;
    return { streak, cells, months, last30, activeDays: counts.size };
  }, [now, stats.activity]);

  const duration = formatDuration(stats.minutes);
  const maxMonth = Math.max(1, ...(computed?.months.map((m) => m.count) ?? [1]));
  const maxShow = Math.max(1, ...stats.topShows.map((s) => s.minutes));

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Hourglass className="size-4" />} label="Time watched" value={duration.big} unit={duration.unit} hint="Estimated from TMDB runtimes" />
        <Tile icon={<Tv className="size-4" />} label="Episodes" value={String(stats.episodes)} unit={`across ${stats.shows} shows`} />
        <Tile icon={<Clapperboard className="size-4" />} label="Movies" value={String(stats.movies)} unit="watched" />
        <Tile
          icon={<Flame className="size-4" />}
          label="Current streak"
          value={computed ? String(computed.streak) : "–"}
          unit={computed?.streak === 1 ? "day" : "days"}
          hint={computed ? `${computed.last30} watches in the last 30 days` : undefined}
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl">Last 12 weeks</h2>
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-1" aria-label="Activity heatmap">
            {(computed?.cells ?? Array.from({ length: 84 }, () => null)).map((c, i) => (
              <span
                key={c?.key ?? i}
                title={c ? `${c.label}: ${c.count} watched` : undefined}
                className={cx(
                  "size-4 rounded-[4px] sm:size-5",
                  !c || c.future
                    ? "bg-transparent"
                    : c.count === 0
                      ? "bg-surface-3"
                      : c.count < 2
                        ? "bg-accent/35"
                        : c.count < 4
                          ? "bg-accent/65"
                          : "bg-accent",
                )}
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Bulk &ldquo;mark everything before&rdquo; entries are left out, so this shows real watching days.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-2xl">By month</h2>
          <div className="mt-5 flex h-40 items-end gap-3">
            {(computed?.months ?? []).map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs text-muted">{m.count || ""}</span>
                <div
                  className="w-full rounded-t-lg bg-accent/80"
                  style={{ height: `${Math.max(m.count ? 6 : 2, (m.count / maxMonth) * 100)}px` }}
                />
                <span className="text-xs text-faint">{m.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-2xl">Most watched</h2>
          {stats.topShows.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Log some episodes and your top shows will appear here.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {stats.topShows.map((s) => (
                <li key={s.id}>
                  <Link href={`/shows/${s.id}`} className="group flex items-center gap-3">
                    <Poster title={s.title} src={s.posterUrl} className="w-9 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium group-hover:text-accent">{s.title}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {s.episodes} eps · {Math.round(s.minutes / 60)}h
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${(s.minutes / maxShow) * 100}%` }} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  unit,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-5xl leading-none">{value}</span>
        <span className="text-sm text-muted">{unit}</span>
      </p>
      {hint ? <p className="mt-2 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}
