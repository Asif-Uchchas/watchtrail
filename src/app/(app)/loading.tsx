export default function Loading() {
  return (
    <div className="space-y-8" aria-busy aria-label="Loading">
      <div className="h-12 w-2/3 max-w-md animate-pulse rounded-xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface/70" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[150px] animate-pulse rounded-2xl bg-surface/60" />
        ))}
      </div>
    </div>
  );
}
