
import { Loader2, Maximize2, Square } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { strings } from '@/lib/strings';
import { usePipeline } from '@/context/PipelineContext';
import { useSession } from '@/context/SessionContext';
import PipelineProgressHeader from './PipelineProgressHeader';

const s = strings.pipelineRunner;

/**
 * Background job dock on /home when a pipeline run is active in background mode.
 */
export default function PipelineRunnerFab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { busy, status, log, backgroundMode, stopping, cancelJob } = usePipeline();
  const { loading: sessionLoading, canMutate } = useSession();

  const onPipelinePage = pathname === '/pipeline' || pathname.startsWith('/pipeline/');
  const isHomePage = pathname === '/home';
  const showDock = backgroundMode && (busy || Boolean(status) || Boolean(log));

  if (!isHomePage || onPipelinePage || sessionLoading || !canMutate || !showDock) {
    return null;
  }

  return (
    <div className="print:hidden fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <div className="flex max-w-[min(100vw-2rem,22rem)] flex-col gap-2">
        {log && busy ? <PipelineProgressHeader log={log} compact className="shadow-xl" /> : null}
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container px-3.5 py-2.5 shadow-xl"
        >
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-md-sys-primary" aria-hidden />
        ) : (
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === 'error' ? 'bg-md-sys-error' : 'bg-md-sys-on-surface-variant'}`}
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-md-sys-on-surface">{s.dockTitle}</p>
          <p className="truncate text-[11px] text-md-sys-on-surface-variant" title={status || log || ''}>
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
          onClick={() => void cancelJob()}
          disabled={!busy || stopping}
          className="shrink-0 rounded-full p-2 text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface press active:scale-95 transition-all disabled:opacity-40"
          aria-label={s.stopJobAria}
          title={stopping ? s.stoppingJob : s.stopJob}
        >
          {stopping ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Square className="h-4 w-4 fill-current" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => navigate('/pipeline')}
          className="shrink-0 rounded-full p-2 text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface press active:scale-95 transition-all"
          aria-label={s.dockExpand}
          title={s.dockExpand}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        </div>
      </div>
    </div>
  );
}
