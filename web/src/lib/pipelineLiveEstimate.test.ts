import { describe, expect, it } from 'vitest';
import { buildInitialPipelineConfigState } from '@/lib/pipelineConfigSchema';
import type { PipelineProgressEvent } from '@/lib/formatPipelineLog';
import { buildPipelineRunPreview } from '@/lib/pipelineRunPreview';
import {
  computeLivePipelineEstimate,
  formatLivePipelineDuration,
  observedCrawlPages,
} from '@/lib/pipelineLiveEstimate';

function crawlFetch(current: number, total: number, ts: number, avgMs = 1200): PipelineProgressEvent {
  return {
    phase: 'crawl',
    step: 'fetch',
    ts,
    current,
    total,
    elapsed_ms: current * avgMs,
    avg_ms: avgMs,
    url: `https://example.com/p${current}`,
  };
}

describe('computeLivePipelineEstimate', () => {
  const preview = buildPipelineRunPreview({
    presetId: 'full-audit',
    configState: { ...buildInitialPipelineConfigState(), max_pages: '30', lighthouse_max_pages: '2' },
  });

  it('reads observed crawl pages from progress stream', () => {
    const events = [
      { phase: 'crawl' as const, step: 'start', ts: 1000 },
      crawlFetch(5, 30, 5000),
      crawlFetch(10, 30, 10000),
    ];
    expect(observedCrawlPages(events)).toBe(10);
  });

  it('shrinks remaining time as crawl progresses', () => {
    const early = computeLivePipelineEstimate(
      preview,
      [
        { phase: 'crawl', step: 'start', ts: 0 },
        crawlFetch(3, 30, 4000, 1500),
      ],
      crawlFetch(3, 30, 4000, 1500),
      'running',
    );
    const later = computeLivePipelineEstimate(
      preview,
      [
        { phase: 'crawl', step: 'start', ts: 0 },
        crawlFetch(20, 30, 30000, 1000),
      ],
      crawlFetch(20, 30, 30000, 1000),
      'running',
    );
    expect(early?.remainingMs).toBeTruthy();
    expect(later?.remainingMs).toBeTruthy();
    expect(later!.remainingMs!).toBeLessThan(early!.remainingMs!);
  });

  it('returns zero remaining when job succeeded', () => {
    const events: PipelineProgressEvent[] = [
      { phase: 'crawl', step: 'start', ts: 0 },
      crawlFetch(30, 30, 20000),
      { phase: 'crawl', step: 'done', ts: 25000 },
      { phase: 'plot', step: 'done', ts: 90000 },
    ];
    const estimate = computeLivePipelineEstimate(
      preview,
      events,
      events[events.length - 1]!,
      'success',
    );
    expect(estimate?.remainingMs).toBe(0);
    expect(estimate?.elapsedMs).toBeGreaterThan(0);
  });

  it('formats elapsed and remaining for the UI', () => {
    const text = formatLivePipelineDuration({
      elapsedMs: 125_000,
      remainingMs: 95_000,
      totalMs: 220_000,
      observedCrawlPages: 12,
      ratePerSec: 1.2,
      source: 'live',
    });
    expect(text).toContain('elapsed');
    expect(text).toContain('left');
  });
});
