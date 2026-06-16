import { Skeleton } from '@/components/Skeleton';

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-default bg-brand-900/40 p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ChartBlockSkeleton() {
  return (
    <div className="rounded-xl border border-default bg-brand-900/40 p-4 space-y-3" role="status" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export function CardBlockSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-default bg-brand-900/40 p-4 space-y-2" role="status" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

export function TableBlockSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-default bg-brand-900/40 p-4 space-y-2" role="status" aria-busy="true">
      <Skeleton className="h-5 w-56 mb-3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
