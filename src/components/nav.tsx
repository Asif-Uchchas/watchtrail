"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Clock, Film, Settings, Tv } from "lucide-react";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Shows", icon: Tv, match: (p: string) => p === "/" || p.startsWith("/shows") },
  { href: "/movies", label: "Movies", icon: Film, match: (p: string) => p.startsWith("/movies") },
  { href: "/history", label: "History", icon: Clock, match: (p: string) => p.startsWith("/history") },
  { href: "/stats", label: "Stats", icon: BarChart3, match: (p: string) => p.startsWith("/stats") },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") || p.startsWith("/help") },
];

export function TopNav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
      {ITEMS.map(({ href, label, match }) => (
        <Link
          key={href}
          href={href}
          className={cx(
            "rounded-lg px-3 py-1.5 text-sm transition",
            match(path) ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cx(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
