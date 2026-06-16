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

/** Default page body placeholder while a report section loads (tabs, filters, table). */
export function ViewPageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-2/3 max-w-md" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-[7.5rem] rounded-lg" />
        ))}
      </div>

      <div className="rounded-xl border border-default bg-brand-900/40 overflow-hidden">
        <div className="flex gap-4 border-b border-default px-4 py-3">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-16 ml-auto hidden sm:block" />
          <Skeleton className="h-3.5 w-14 hidden sm:block" />
          <Skeleton className="h-3.5 w-14 hidden md:block" />
          <Skeleton className="h-3.5 w-12 hidden md:block" />
        </div>
        <div className="divide-y divide-default/60">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-1 max-w-md" />
              <Skeleton className="h-4 w-10 shrink-0 hidden sm:block" />
              <Skeleton className="h-4 w-12 shrink-0 hidden sm:block" />
              <Skeleton className="h-4 w-14 shrink-0 hidden md:block" />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-default px-4 py-3">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
