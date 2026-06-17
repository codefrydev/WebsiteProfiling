import { Skeleton } from '@/components/Skeleton';
import { strings } from '@/lib/strings';

const app = strings.app;

export default function AppLoadingScreen() {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center bg-brand-900 text-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={app.loading}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 landing-grid-bg opacity-30" />

      <div className="relative w-full max-w-sm px-6 sm:max-w-md">
        <p className="landing-gradient-text text-center text-lg font-bold tracking-tight sm:text-xl">
          {app.productName}
        </p>
        <p className="mt-1 text-center text-xs text-muted-foreground">{app.productSubtitle}</p>

        <div
          aria-hidden
          className="mt-8 space-y-3 rounded-xl border border-default/60 bg-brand-900/40 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </div>
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        </div>

        <p className="shimmer-text mt-8 text-center text-sm font-semibold sm:text-base">{app.loading}</p>
        <p className="mt-1.5 text-center text-xs text-muted-foreground sm:text-sm">{app.loadingSubtitle}</p>
      </div>
    </div>
  );
}
