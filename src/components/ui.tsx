import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background,color,border-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_8px_24px_-12px_rgb(245_181_68/0.7)]",
  secondary: "bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

const squareSizes: Record<Size, string> = { sm: "size-8", md: "size-10", lg: "size-12" };

/** Square, icon-only button styling (no horizontal padding to fight with). */
export function iconButtonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(base, "shrink-0", variants[variant], squareSizes[size], extra);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export const inputClass =
  "w-full h-11 rounded-xl bg-surface-2 border border-line px-3.5 text-[15px] text-ink placeholder:text-faint outline-none transition focus:border-accent/70 focus:bg-surface-3 focus:ring-4 focus:ring-accent/10";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#18181d" />
        <circle cx="13" cy="44" r="3" fill="#f5b544" opacity=".35" />
        <circle cx="21" cy="40" r="3.4" fill="#f5b544" opacity=".6" />
        <path d="M28 18.5v27a2 2 0 0 0 3 1.7l22-13.5a2 2 0 0 0 0-3.4L31 16.8a2 2 0 0 0-3 1.7Z" fill="#f5b544" />
      </svg>
      <span className="font-display text-[26px] leading-none tracking-tight">Watchtrail</span>
    </span>
  );
}

/** Deterministic warm/cool gradient per title, used when there is no poster. */
function paletteFor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    from: `hsl(${hue} 45% 22%)`,
    to: `hsl(${(hue + 40) % 360} 55% 9%)`,
    glow: `hsl(${hue} 80% 65% / 0.25)`,
  };
}

export function Poster({
  title,
  src,
  className,
  label,
}: {
  title: string;
  src?: string | null;
  className?: string;
  label?: ReactNode;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote TMDB art, sized by CSS
      <img
        src={src}
        alt=""
        loading="lazy"
        className={cx("aspect-[2/3] w-full rounded-xl object-cover bg-surface-2 ring-1 ring-white/5", className)}
      />
    );
  }
  const p = paletteFor(title);
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className={cx(
        "relative aspect-[2/3] w-full overflow-hidden rounded-xl ring-1 ring-white/5 flex flex-col justify-between p-3",
        className,
      )}
      style={{ background: `radial-gradient(120% 80% at 20% 0%, ${p.glow}, transparent 60%), linear-gradient(160deg, ${p.from}, ${p.to})` }}
    >
      <span className="font-display text-4xl leading-none text-white/85">{initials}</span>
      <span className="line-clamp-3 font-display text-lg leading-tight text-white/70">{label ?? title}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-surface-2 text-accent">{icon}</div>
      <h3 className="font-display text-2xl">{title}</h3>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="font-display text-[28px] leading-none tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

export function timeAgo(date: Date | number | null | undefined): string {
  if (!date) return "";
  const ms = typeof date === "number" ? date : date.getTime();
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
