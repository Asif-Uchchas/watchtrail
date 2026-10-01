import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listHistory } from "@/lib/library";
import { HistoryList } from "@/components/history-list";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  const user = await requireUser();
  const items = await listHistory(user.id);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-5xl leading-none tracking-tight">History</h1>
        <p className="mt-2 text-muted">Everything you&apos;ve logged, newest first.</p>
      </section>

      {items.length === 0 ? (
        <EmptyState icon={<Clock className="size-5" />} title="Nothing watched yet">
          Episodes and movies you log will show up here.
        </EmptyState>
      ) : (
        <HistoryList items={items} />
      )}
    </div>
  );
}
