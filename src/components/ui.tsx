import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-[background,color,border-color] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary: "bg-transparent text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

const squareSizes: Record<Size, string> = { sm: "size-8", md: "size-10", lg: "size-11" };

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
  "w-full h-11 rounded-[10px] bg-surface border border-line-strong px-3.5 text-[15px] text-ink placeholder:text-faint outline-none transition focus:border-accent/70";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5 text-[18px] font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
        <path d="M7 4.5v15l13-7.5z" fill="#f2b84b" />
      </svg>
      Watchtrail
    </span>
  );
}

/** A stable muted tint per title, used when there is no poster. */
function tintFor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 14% 21%)`;
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
        className={cx("aspect-[2/3] w-full rounded-lg object-cover bg-surface-2", className)}
      />
    );
  }
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className={cx("flex aspect-[2/3] w-full items-end overflow-hidden rounded-lg p-[8%]", className)}
      style={{ background: tintFor(title) }}
    >
      <span className="font-mono text-[clamp(11px,28%,26px)] leading-none text-white/75">{label ?? initials}</span>
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
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-surface-2 text-muted">{icon}</div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">{children}</h2>
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
