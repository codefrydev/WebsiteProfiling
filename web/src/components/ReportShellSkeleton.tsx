'use client';

import { Menu } from 'lucide-react';
import AppLogo from './AppLogo';
import { Skeleton, SkeletonDomainCard } from './Skeleton';
import { strings } from '@/lib/strings';
import ThemeToggle from './ThemeToggle';

type ReportShellSkeletonVariant = 'home' | 'dashboard';

interface ReportShellSkeletonProps {
  variant: ReportShellSkeletonVariant;
}

/**
 * Layout chrome + content placeholders while ReportProvider fetches meta + payload.
 */
export default function ReportShellSkeleton({ variant }: ReportShellSkeletonProps) {
  const loadingLabel = strings.app.loading;

  if (variant === 'home') {
    return (
      <div
        className="min-h-screen bg-brand-900 text-foreground"
        role="status"
        aria-busy="true"
        aria-label={loadingLabel}
      >
        <span className="sr-only">{loadingLabel}</span>
        <main className="min-h-screen overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 pt-6 pb-12 w-full space-y-4">
            <div className="text-center space-y-2">
              <Skeleton className="h-7 w-64 mx-auto" />
              <Skeleton className="h-3 w-48 mx-auto" />
            </div>
            <Skeleton className="h-10 w-full rounded-full max-w-xl mx-auto" />
            <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto">
              <Skeleton className="h-14 w-full rounded-md" />
              <Skeleton className="h-14 w-full rounded-md" />
              <Skeleton className="h-14 w-full rounded-md" />
            </div>
            <div className="flex flex-row flex-wrap justify-center gap-3 pt-4">
              <SkeletonDomainCard />
              <SkeletonDomainCard />
              <SkeletonDomainCard />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-brand-900 text-foreground flex overflow-hidden"
      role="status"
      aria-busy="true"
      aria-label={loadingLabel}
    >
      <span className="sr-only">{loadingLabel}</span>
      <aside className="hidden md:flex w-64 bg-brand-800 border-r border-muted flex-col h-screen shrink-0">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-muted bg-brand-900/30 shrink-0">
          <AppLogo className="opacity-60" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-[70%]" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-3" aria-hidden>
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-muted bg-brand-900/30 space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="h-16 border-b border-muted bg-brand-800/80 backdrop-blur-md flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0">
          <button
            type="button"
            disabled
            className="md:hidden p-2 -ml-2 text-muted-foreground rounded-lg shrink-0 opacity-50"
            aria-hidden
          >
            <Menu className="h-6 w-6" />
          </button>
          <Skeleton className="h-9 flex-1 max-w-xl rounded-lg" />
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <ThemeToggle />
            <Skeleton className="h-9 w-[7.5rem] sm:w-36 rounded-lg" />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-[var(--spacing-page-x)] pt-4 pb-6 sm:px-6 lg:px-8 lg:pt-5 lg:pb-8 space-y-4">
          <Skeleton className="h-8 w-56 max-w-[80%]" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-48 sm:h-64 w-full rounded-xl border border-default" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-xl border border-default" />
            <Skeleton className="h-32 rounded-xl border border-default" />
          </div>
        </div>
      </main>
    </div>
  );
}
