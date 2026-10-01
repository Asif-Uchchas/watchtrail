import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Logo } from "@/components/ui";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getUser()) redirect("/");

  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(600px 400px at 20% 20%, rgb(245 181 68 / 0.18), transparent 60%), radial-gradient(500px 300px at 90% 90%, rgb(120 120 255 / 0.08), transparent 60%)",
          }}
        />
        <Logo className="relative" />
        <div className="relative max-w-md">
          <h1 className="font-display text-6xl leading-[0.95] tracking-tight">
            Never lose your <em className="text-accent">place</em> again.
          </h1>
          <p className="mt-5 text-lg text-muted">
            Paste the link you&apos;d open in VLC. Watchtrail remembers the episode and hands you the next one, on your
            phone and your PC.
          </p>
        </div>
        <ul className="relative space-y-2 font-mono text-[13px] text-faint">
          <li>
            <span className="text-accent">✓</span> House · S02E05 · watched 2h ago
          </li>
          <li>
            <span className="text-accent">▶</span> House · S02E06 · up next
          </li>
        </ul>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
