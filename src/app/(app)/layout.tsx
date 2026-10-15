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
      <header className="border-b border-line" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-16 max-w-[920px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Watchtrail home" className="md:mr-4">
            <Logo />
          </Link>
          <div className="hidden flex-1 md:block">
            <TopNav />
          </div>
          <div className="flex items-center gap-1.5">
            <span
              title={`${user.name} · ${user.email}`}
              className="grid size-8 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-ink"
            >
              {initial}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="grid size-10 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <LogOut className="size-4" />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[920px] flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-16 md:pt-10">{children}</main>
      <BottomNav />
    </>
  );
}
