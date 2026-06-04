'use client';

import { Loader2, Maximize2, Terminal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { strings } from '@/lib/strings';
import { usePipeline } from '@/context/PipelineContext';
import { storePipelineReturnPath } from '@/lib/pipelineReturn';

const s = strings.pipelineRunner;

/**
 * Floating entry point + background job dock (hidden on /pipeline page).
 */
export default function PipelineRunnerFab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { busy, status, log, backgroundMode, openPipelinePage } = usePipeline();

  const onPipelinePage = pathname === '/pipeline' || pathname.startsWith('/pipeline/');
  const showDock = backgroundMode && (busy || Boolean(status) || Boolean(log));

  const goToPipeline = () => {
    const q = searchParams.toString();
    const current = q ? `${pathname}?${q}` : pathname;
    if (!onPipelinePage) {
      storePipelineReturnPath(current);
    }
    openPipelinePage('run');
  };

  if (onPipelinePage) {
    return null;
  }

  return (
    <div className="print:hidden fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {showDock ? (
        <div
          role="status"
          aria-live="polite"
          className="flex max-w-[min(100vw-2rem,20rem)] items-center gap-3 rounded-xl border border-default bg-brand-800 px-3 py-2.5 shadow-xl"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-link" aria-hidden />
          ) : (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'}`}
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-bright">{s.dockTitle}</p>
            <p className="truncate text-[11px] text-muted-foreground" title={status || log || ''}>
              {busy
                ? s.dockRunning
                : status === 'error'
                  ? s.dockFailed
                  : status
                    ? `${s.statusLabel}: ${status}`
                    : log
                      ? s.dockFailed
                      : 'Idle'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/pipeline')}
            className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-brand-700 hover:text-foreground"
            aria-label={s.dockExpand}
            title={s.dockExpand}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={goToPipeline}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
        aria-label={showDock ? s.fabAriaExpand : s.fabAriaOpen}
        title={s.fabTitle}
      >
        <Terminal className="h-7 w-7" aria-hidden />
      </button>
    </div>
  );
}
