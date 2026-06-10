'use client';

import Link from 'next/link';
import { strings } from '@/lib/strings';

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-bright">{strings.app.failedTitle}</h1>
        <p className="text-muted-foreground text-sm mt-2">
          {error.message || strings.app.failedHint}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground hover:bg-brand-700/80 transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
