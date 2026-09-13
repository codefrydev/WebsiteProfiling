
import { useMemo } from 'react';
import { Check, Loader2, Pause, Play } from 'lucide-react';
import type { PipelineJobStatus } from '@/types/api';
import type { LivePipelineEstimate } from '@/lib/pipelineLiveEstimate';
import {
  PHASE_LABELS,
  PIPELINE_STEPPER_PHASES,
  computeEta,
  crawlProgressCountLabel,
  crawlProgressPercent,
  formatDurationMs,
  parsePipelineProgressEvents,
  resolveActiveProgress,
  stepLabel,
  type ProgressPhase,
} from '@/lib/formatPipelineLog';

export interface PipelineProgressHeaderProps {
  log: string;
  status?: PipelineJobStatus | '';
  liveEstimate?: LivePipelineEstimate | null;
  compact?: boolean;
  className?: string;
  onPause?: () => void;
  onResume?: () => void;
}

function truncateUrl(url: string, max = 56): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

function phaseIndex(phase: ProgressPhase): number {
  const idx = PIPELINE_STEPPER_PHASES.indexOf(phase);
  return idx >= 0 ? idx : -1;
}

export default function PipelineProgressHeader({
  log,
  status = '',
  liveEstimate = null,
  compact = false,
  className = '',
  onPause,
  onResume,
}: PipelineProgressHeaderProps) {
  const events = useMemo(() => parsePipelineProgressEvents(log), [log]);
  const latest = useMemo(() => resolveActiveProgress(events, status), [events, status]);
  const eta = useMemo(() => computeEta(latest, events), [latest, events]);

  if (!latest) return null;

  const jobPaused = status === 'paused';
  const jobFinished = status === 'success' || status === 'error';
  const activePhase = latest.phase;
  const activeIdx = jobFinished && latest.step === 'done' ? PIPELINE_STEPPER_PHASES.length : phaseIndex(activePhase);
  const stepText = stepLabel(latest.step, latest.message);
  const phaseLabel = PHASE_LABELS[activePhase] ?? activePhase;
  const isActive = !jobFinished && latest.step !== 'done';
  const countLabel =
    latest.phase === 'crawl' && latest.current != null && latest.current > 0
      ? crawlProgressCountLabel(latest)
      : latest.current != null && latest.total != null && latest.total > 0
        ? `${latest.current}/${latest.total}${
            latest.current >= latest.total ? ' (100%)' : ''
          }`
        : null;
  const barPct =
    isActive && latest.current != null && latest.current > 0
      ? latest.phase === 'crawl'
        ? crawlProgressPercent(latest)
        : latest.total != null && latest.total > 0
          ? Math.min(100, Math.round(((latest.current ?? 0) / latest.total) * 100))
          : null
      : null;
  const hasBar = isActive && barPct != null;

  return (
    <div
      className={`rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/80 ${compact ? 'px-2 py-2' : 'px-3 py-3'} ${className}`}
      role="status"
      aria-live="polite"
    >
      {!compact ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {PIPELINE_STEPPER_PHASES.map((phase, i) => {
            const done = jobFinished && latest.step === 'done' ? true : activeIdx >= 0 && i < activeIdx;
            const active = !jobFinished && phase === activePhase && latest.step !== 'done';
            const future = !done && !active;
            return (
              <div key={phase} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    active
                      ? 'bg-md-sys-primary-container text-md-sys-on-primary-container ring-1 ring-md-sys-primary/40'
                      : done
                        ? 'bg-md-sys-success-container text-md-sys-on-success-container'
                        : future
                          ? 'text-md-sys-on-surface-variant/60'
                          : 'text-md-sys-on-surface-variant'
                  }`}
                >
                  {PHASE_LABELS[phase]}
                </span>
                {i < PIPELINE_STEPPER_PHASES.length - 1 ? (
                  <span className="text-md-sys-on-surface-variant/40 text-[10px]">›</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <div className="flex min-w-0 items-center gap-2">
          {isActive ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-md-sys-primary" aria-hidden />
          ) : jobPaused ? (
            <Pause className="h-3.5 w-3.5 shrink-0 text-md-sys-warning" aria-hidden />
          ) : jobFinished && status === 'success' ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-md-sys-success" aria-hidden />
          ) : null}
          <span className="font-medium text-md-sys-on-surface">
            {jobPaused ? 'Paused' : phaseLabel}
            {!compact ? ` · ${jobPaused ? 'Crawl saved — click Resume to continue' : stepText}` : `: ${jobPaused ? 'paused' : stepText}`}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 tabular-nums text-md-sys-on-surface-variant">
          {countLabel ? <span>{countLabel}</span> : null}
          {eta.ratePerSec != null && latest.phase === 'crawl' ? (
            <span>{eta.ratePerSec.toFixed(1)} pg/s</span>
          ) : null}
          {eta.elapsedMs != null ? <span>elapsed {formatDurationMs(eta.elapsedMs)}</span> : null}
          {eta.remainingMs != null && !liveEstimate?.remainingMs ? (
            <span className="text-md-sys-on-surface/80">step ETA {formatDurationMs(eta.remainingMs)}</span>
          ) : null}
          {liveEstimate?.remainingMs != null && isActive ? (
            <span className="font-medium text-md-sys-on-surface/90">
              ~{formatDurationMs(liveEstimate.remainingMs)} left total
            </span>
          ) : null}
          {isActive && latest.phase === 'crawl' && onPause && !compact ? (
            <button
              type="button"
              onClick={onPause}
              className="press ml-1 flex items-center gap-1 rounded-full border border-md-sys-warning/40 bg-md-sys-warning-container/30 px-2.5 py-0.5 text-[10px] font-medium text-md-sys-on-warning-container hover:bg-md-sys-warning-container/50 active:scale-[0.98] transition-all"
              title="Pause crawl and save frontier"
            >
              <Pause className="h-2.5 w-2.5" aria-hidden />
              Pause
            </button>
          ) : null}
          {jobPaused && onResume && !compact ? (
            <button
              type="button"
              onClick={onResume}
              className="press ml-1 flex items-center gap-1 rounded-full border border-md-sys-success/40 bg-md-sys-success-container/30 px-2.5 py-0.5 text-[10px] font-medium text-md-sys-on-success-container hover:bg-md-sys-success-container/50 active:scale-[0.98] transition-all"
              title="Resume crawl from saved frontier"
            >
              <Play className="h-2.5 w-2.5" aria-hidden />
              Resume
            </button>
          ) : null}
        </div>
      </div>

      {liveEstimate?.ratePerSec != null && isActive && latest.phase === 'crawl' && !compact ? (
        <p className="mt-1.5 text-[10px] text-md-sys-on-surface-variant">
          Avg {liveEstimate.ratePerSec.toFixed(2)} pages/s
          {liveEstimate.observedCrawlPages != null ? ` · ${liveEstimate.observedCrawlPages} crawled` : ''}
          {liveEstimate.totalMs != null ? ` · ~${formatDurationMs(liveEstimate.totalMs)} projected total` : ''}
        </p>
      ) : null}

      {hasBar && barPct != null ? (
        <div className={`${compact ? 'mt-1.5' : 'mt-2'} h-1.5 overflow-hidden rounded-full bg-md-sys-surface-container-high/80`}>
          <div
            className="h-full rounded-full bg-md-sys-primary transition-[width] duration-300 ease-out"
            style={{ width: `${barPct}%` }}
          />
        </div>
      ) : latest.step !== 'done' ? (
        <div className={`${compact ? 'mt-1.5' : 'mt-2'} h-1.5 overflow-hidden rounded-full bg-md-sys-surface-container-high/80`}>
          <div className="h-full w-1/3 animate-pulse rounded-full bg-md-sys-primary/50" />
        </div>
      ) : null}

      {latest.url && !compact ? (
        <p className="mt-2 truncate font-mono text-[11px] text-md-sys-on-surface-variant" title={latest.url}>
          {truncateUrl(latest.url)}
        </p>
      ) : null}
    </div>
  );
}
