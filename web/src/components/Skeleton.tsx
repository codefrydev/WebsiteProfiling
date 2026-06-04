/**
 * Pulse placeholders for server-driven views (matches brand surfaces).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-brand-800/90 dark:bg-white/[0.07] ${className}`.trim()}
      aria-hidden
    />
  );
}

/** Rounded rectangle mimicking a portfolio / domain card on Home. */
export function SkeletonDomainCard() {
  return (
    <div className="w-[min(260px,100%)] max-w-[260px] rounded-xl border border-default bg-brand-900/40 p-2 space-y-2">
      <div className="flex justify-between gap-2">
        <div className="space-y-1.5 flex-1 min-w-0">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-4 w-[85%]" />
        </div>
        <div className="space-y-1.5 shrink-0 text-right">
          <Skeleton className="h-2.5 w-10 ml-auto" />
          <Skeleton className="h-6 w-8 ml-auto" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
      <div className="flex gap-1 pt-0.5">
        <Skeleton className="h-5 w-12 rounded-md" />
        <Skeleton className="h-5 w-12 rounded-md" />
        <Skeleton className="h-5 w-12 rounded-md" />
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
    </div>
  );
}
