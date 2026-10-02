import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getWatchStats } from "@/lib/library";
import { StatsView } from "@/components/stats-view";

export const metadata: Metadata = { title: "Stats" };

export default async function StatsPage() {
  const user = await requireUser();
  const stats = await getWatchStats(user.id);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-5xl leading-none tracking-tight">Stats</h1>
        <p className="mt-2 text-muted">How much you&apos;ve watched, and how often.</p>
      </section>
      <StatsView stats={stats} />
    </div>
  );
}
