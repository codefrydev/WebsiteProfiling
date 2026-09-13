/**
 * Pulse placeholders for server-driven views (matches brand surfaces).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`shimmer rounded-md bg-md-sys-surface-container/90 dark:bg-white/[0.07] ${className}`.trim()}
      aria-hidden
    />
  );
}

/** Rounded rectangle mimicking a portfolio / domain card on Home. */
export function SkeletonDomainCard() {
  return (
    <div className="w-[min(520px,100%)] max-w-[520px] rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container p-3 space-y-3">
      <div className="flex justify-between gap-2">
        <div className="space-y-1.5 flex-1 min-w-0">
          <Skeleton className="h-2.5 w-12 rounded-full" />
          <Skeleton className="h-4 w-[85%] rounded-md" />
        </div>
        <div className="space-y-1.5 shrink-0 text-right">
          <Skeleton className="h-2.5 w-10 ml-auto rounded-full" />
          <Skeleton className="h-6 w-8 ml-auto rounded-md" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="flex gap-1.5 pt-0.5">
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
    </div>
  );
}
