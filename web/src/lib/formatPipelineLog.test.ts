import { describe, expect, it } from 'vitest';
import {
  computeEta,
  extractLatestProgress,
  formatDurationMs,
  parsePipelineLog,
  parsePipelineProgressEvents,
  resolveActiveProgress,
  stepLabel,
} from '@/lib/formatPipelineLog';

describe('parsePipelineProgressEvents', () => {
  it('parses @progress JSON lines', () => {
    const raw = [
      '[Crawl] Starting...',
      '@progress {"phase":"crawl","step":"fetch","current":3,"total":10,"ts":1000,"elapsed_ms":3000,"avg_ms":1000}',
      '@progress {"phase":"crawl","step":"fetch","current":6,"total":10,"ts":2000,"elapsed_ms":6000,"avg_ms":1000}',
    ].join('\n');
    const events = parsePipelineProgressEvents(raw);
    expect(events).toHaveLength(2);
    expect(events[1]?.current).toBe(6);
    expect(extractLatestProgress(events)?.total).toBe(10);
  });

  it('renders @progress lines as rich log entries', () => {
    const raw = [
      '@progress {"phase":"crawl","step":"start","message":"Crawling pages","ts":1}',
      '@progress {"phase":"crawl","step":"fetch","current":5,"total":30,"url":"https://example.com/about","ts":2}',
      '@progress {"phase":"report","step":"categories","message":"Building categories","ts":3}',
      '[Report] Done.',
    ].join('\n');
    const lines = parsePipelineLog(raw);
    expect(lines.some((l) => l.text.startsWith('@progress'))).toBe(false);
    expect(lines.some((l) => l.kind === 'activity' && l.text.includes('example.com/about'))).toBe(true);
    expect(lines.some((l) => l.text.includes('[Crawl]'))).toBe(true);
    expect(lines.some((l) => l.text.includes('[Report]'))).toBe(true);
  });
});

describe('resolveActiveProgress', () => {
  it('marks plot complete when job succeeded but last event was plot start', () => {
    const events = [
      { phase: 'crawl' as const, step: 'done', ts: 1, message: 'crawl complete' },
      { phase: 'plot' as const, step: 'start', ts: 2, message: 'plot starting' },
    ];
    const resolved = resolveActiveProgress(events, 'success');
    expect(resolved?.step).toBe('done');
    expect(resolved?.phase).toBe('plot');
  });
});

describe('computeEta', () => {
  it('estimates remaining time from avg_ms', () => {
    const history = [
      { phase: 'crawl' as const, step: 'fetch', ts: 1, current: 2, total: 10, elapsed_ms: 2000, avg_ms: 1000 },
      { phase: 'crawl' as const, step: 'fetch', ts: 2, current: 5, total: 10, elapsed_ms: 5000, avg_ms: 1000 },
    ];
    const latest = history[1]!;
    const eta = computeEta(latest, history);
    expect(eta.percent).toBe(50);
    expect(eta.ratePerSec).toBeCloseTo(1, 1);
    expect(eta.remainingMs).toBe(5000);
  });
});

describe('stepLabel', () => {
  it('prefers message over step map', () => {
    expect(stepLabel('fetch', 'Custom step')).toBe('Custom step');
    expect(stepLabel('categories')).toBe('Building categories');
  });
});

describe('formatDurationMs', () => {
  it('formats seconds and minutes', () => {
    expect(formatDurationMs(45000)).toBe('45s');
    expect(formatDurationMs(125000)).toBe('2m 5s');
  });
});
