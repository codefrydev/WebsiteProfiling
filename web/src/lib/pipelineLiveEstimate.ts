import {
  computeEta,
  formatDurationMs,
  type PipelineJobStatus,
  type PipelineProgressEvent,
  type ProgressPhase,
} from '@/lib/formatPipelineLog';
import type { PipelinePhaseTiming, PipelineRunPreview } from '@/lib/pipelineRunPreview';

export interface LivePipelineEstimate {
  /** Wall-clock elapsed since first progress event. */
  elapsedMs: number;
  /** Projected time left for this run (ms). */
  remainingMs: number | null;
  /** elapsed + remaining when known. */
  totalMs: number | null;
  /** Pages crawled so far from live @progress samples. */
  observedCrawlPages: number | null;
  /** Rolling throughput for the active counted step (pages/sec). */
  ratePerSec: number | null;
  source: 'live' | 'static';
}

const PIPELINE_PHASE_ORDER: ProgressPhase[] = [
  'config',
  'crawl',
  'content_analysis',
  'lighthouse',
  'report',
  'keywords',
  'plot',
];

export function observedCrawlPages(events: PipelineProgressEvent[]): number | null {
  const fetchEvents = events.filter(
    (e) => e.phase === 'crawl' && e.step === 'fetch' && e.current != null && e.current > 0,
  );
  if (!fetchEvents.length) return null;
  return fetchEvents[fetchEvents.length - 1]!.current ?? null;
}

function phaseIsDone(phase: ProgressPhase, events: PipelineProgressEvent[]): boolean {
  return events.some((e) => e.phase === phase && e.step === 'done');
}

function scalePendingPhases(
  typicalSeconds: number,
  preview: PipelineRunPreview,
  observedPages: number | null,
): number {
  if (observedPages == null || preview.maxCrawlPages == null || preview.typicalCrawlPages == null) {
    return typicalSeconds;
  }
  const baseline = Math.max(1, preview.typicalCrawlPages);
  const ratio = observedPages / baseline;
  const clamped = Math.max(0.35, Math.min(1.25, ratio));
  return typicalSeconds * clamped;
}

function pendingPhaseSeconds(
  timing: PipelinePhaseTiming,
  preview: PipelineRunPreview,
  observedPages: number | null,
): number {
  if (timing.phase === 'report' && observedPages != null) {
    const base = 25 + observedPages * 0.012;
    return Math.max(15, base);
  }
  if (timing.phase === 'lighthouse' && observedPages != null && preview.lighthousePages != null) {
    const sample = Math.min(preview.lighthousePages, observedPages);
    if (sample <= 0) return timing.typicalSeconds;
    const workers = 2;
    return 12 + (sample / workers) * 38 * 0.92;
  }
  return scalePendingPhases(timing.typicalSeconds, preview, observedPages);
}

/**
 * Rolling pipeline ETA using live @progress averages for the active step
 * and scaled static estimates for phases still ahead.
 */
export function computeLivePipelineEstimate(
  preview: PipelineRunPreview,
  events: PipelineProgressEvent[],
  latest: PipelineProgressEvent | null,
  jobStatus: PipelineJobStatus = '',
): LivePipelineEstimate | null {
  if (!events.length) return null;

  const observed = observedCrawlPages(events);
  const pipelineStart = events[0]?.ts;
  const elapsedMs =
    pipelineStart != null && latest?.ts != null
      ? Math.max(0, latest.ts - pipelineStart)
      : Math.max(0, latest?.elapsed_ms ?? 0);

  if (jobStatus === 'success' || jobStatus === 'error') {
    const totalMs = pipelineStart != null && events.length > 1
      ? Math.max(elapsedMs, (events[events.length - 1]!.ts ?? 0) - pipelineStart)
      : elapsedMs;
    return {
      elapsedMs: totalMs,
      remainingMs: 0,
      totalMs,
      observedCrawlPages: observed,
      ratePerSec: null,
      source: 'live',
    };
  }

  if (!latest) {
    return {
      elapsedMs,
      remainingMs: preview.timeMaxSeconds * 1000,
      totalMs: elapsedMs + preview.timeMaxSeconds * 1000,
      observedCrawlPages: observed,
      ratePerSec: null,
      source: 'static',
    };
  }

  const phaseEta = computeEta(latest, events);
  const activePhase = latest.phase as ProgressPhase;
  const activeIdx = PIPELINE_PHASE_ORDER.indexOf(activePhase);

  let remainingMs = 0;

  for (const timing of preview.phaseTimings) {
    const phase = timing.phase as ProgressPhase;
    const phaseIdx = PIPELINE_PHASE_ORDER.indexOf(phase);
    if (phaseIdx < 0) continue;
    if (phaseIsDone(phase, events)) continue;
    if (activeIdx >= 0 && phaseIdx < activeIdx) continue;

    const isActive = phase === activePhase && latest.step !== 'done';

    if (isActive) {
      if (phaseEta.remainingMs != null && phaseEta.remainingMs > 0) {
        remainingMs += phaseEta.remainingMs;
      } else if (timing.typicalSeconds > 0) {
        const pct = phaseEta.percent ?? 0;
        const fallback = timing.typicalSeconds * 1000;
        remainingMs += fallback * Math.max(0.08, (100 - pct) / 100);
      }
      continue;
    }

    if (activeIdx >= 0 && phaseIdx > activeIdx) {
      remainingMs += pendingPhaseSeconds(timing, preview, observed) * 1000;
    }
  }

  if (remainingMs <= 0 && latest.step === 'start') {
    const timing = preview.phaseTimings.find((t) => t.phase === activePhase);
    if (timing) remainingMs = timing.typicalSeconds * 1000;
  }

  remainingMs = Math.round(Math.max(0, remainingMs));

  return {
    elapsedMs,
    remainingMs,
    totalMs: elapsedMs + remainingMs,
    observedCrawlPages: observed,
    ratePerSec: phaseEta.ratePerSec,
    source: 'live',
  };
}

export function formatLivePipelineDuration(estimate: LivePipelineEstimate): string {
  const elapsed = formatDurationMs(estimate.elapsedMs);
  if (estimate.remainingMs == null || estimate.remainingMs <= 0) {
    return elapsed;
  }
  const remaining = formatDurationMs(estimate.remainingMs);
  const total =
    estimate.totalMs != null ? formatDurationMs(estimate.totalMs) : null;
  if (total) {
    return `${elapsed} elapsed · ~${remaining} left (~${total} total)`;
  }
  return `${elapsed} elapsed · ~${remaining} left`;
}
