'use client';

import { useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
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
}: PipelineProgressHeaderProps) {
  const events = useMemo(() => parsePipelineProgressEvents(log), [log]);
  const latest = useMemo(() => resolveActiveProgress(events, status), [events, status]);
  const eta = useMemo(() => computeEta(latest, events), [latest, events]);

  if (!latest) return null;

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
      className={`rounded-lg border border-default bg-brand-900/80 ${compact ? 'px-2 py-2' : 'px-3 py-3'} ${className}`}
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
                      ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-500/40'
                      : done
                        ? 'bg-green-500/15 text-green-300'
                        : future
                          ? 'text-muted-foreground/60'
                          : 'text-muted-foreground'
                  }`}
                >
                  {PHASE_LABELS[phase]}
                </span>
                {i < PIPELINE_STEPPER_PHASES.length - 1 ? (
                  <span className="text-muted-foreground/40 text-[10px]">›</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <div className="flex min-w-0 items-center gap-2">
          {isActive ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-link" aria-hidden />
          ) : jobFinished && status === 'success' ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden />
          ) : null}
          <span className="font-medium text-foreground">
            {phaseLabel}
            {!compact ? ` · ${stepText}` : `: ${stepText}`}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 tabular-nums text-muted-foreground">
          {countLabel ? <span>{countLabel}</span> : null}
          {eta.ratePerSec != null && latest.phase === 'crawl' ? (
            <span>{eta.ratePerSec.toFixed(1)} pg/s</span>
          ) : null}
          {eta.elapsedMs != null ? <span>elapsed {formatDurationMs(eta.elapsedMs)}</span> : null}
          {eta.remainingMs != null && !liveEstimate?.remainingMs ? (
            <span className="text-foreground/80">step ETA {formatDurationMs(eta.remainingMs)}</span>
          ) : null}
          {liveEstimate?.remainingMs != null && isActive ? (
            <span className="font-medium text-foreground/90">
              ~{formatDurationMs(liveEstimate.remainingMs)} left total
            </span>
          ) : null}
        </div>
      </div>

      {liveEstimate?.ratePerSec != null && isActive && latest.phase === 'crawl' && !compact ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Avg {liveEstimate.ratePerSec.toFixed(2)} pages/s
          {liveEstimate.observedCrawlPages != null ? ` · ${liveEstimate.observedCrawlPages} crawled` : ''}
          {liveEstimate.totalMs != null ? ` · ~${formatDurationMs(liveEstimate.totalMs)} projected total` : ''}
        </p>
      ) : null}

      {hasBar && barPct != null ? (
        <div className={`${compact ? 'mt-1.5' : 'mt-2'} h-1.5 overflow-hidden rounded-full bg-brand-700/80`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-[width] duration-300 ease-out"
            style={{ width: `${barPct}%` }}
          />
        </div>
      ) : latest.step !== 'done' ? (
        <div className={`${compact ? 'mt-1.5' : 'mt-2'} h-1.5 overflow-hidden rounded-full bg-brand-700/80`}>
          <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500/50" />
        </div>
      ) : null}

      {latest.url && !compact ? (
        <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground" title={latest.url}>
          {truncateUrl(latest.url)}
        </p>
      ) : null}
    </div>
  );
}
