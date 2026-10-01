import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { BottomNav, TopNav } from "@/components/nav";
import { Logo } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Watchtrail home">
            <Logo />
          </Link>
          <TopNav />
          <div className="flex items-center gap-2">
            <span
              title={`${user.name} · ${user.email}`}
              className="grid size-8 place-items-center rounded-full bg-surface-3 text-[13px] font-semibold text-accent"
            >
              {initial}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <LogOut className="size-4" />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-16 md:pt-10">{children}</main>
      <BottomNav />
    </>
  );
}
