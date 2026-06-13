import { describe, expect, it } from 'vitest';
import { getMetricHelp, getMetricHelpBody, metricHelpHint } from '@/lib/metricHelp';

describe('getMetricHelp', () => {
  it('returns shared metric entries', () => {
    const clicks = getMetricHelp('shared.clicks');
    expect(clicks?.body).toContain('Search Console');
  });

  it('returns view-specific entries', () => {
    const linkScore = getMetricHelp('views.overview.linkScore');
    expect(linkScore?.body).toMatch(/internal|link/i);
    expect(getMetricHelp('views.keywordsExplorer.quickWins')?.body).toMatch(/position/i);
    expect(getMetricHelp('views.jsErrors.consoleTotal')?.body).toMatch(/console/i);
    expect(getMetricHelp('views.links.chartStatus')?.body).toMatch(/filter/i);
    expect(getMetricHelp('views.contentAnalytics.wordCountDist')?.body).toBeTruthy();
  });

  it('returns undefined for unknown paths', () => {
    expect(getMetricHelp('shared.notARealMetric')).toBeUndefined();
    expect(getMetricHelp('')).toBeUndefined();
  });

  it('getMetricHelpBody returns body string only', () => {
    expect(getMetricHelpBody('shared.ctr')).toContain('click');
  });

  it('metricHelpHint returns string when no title', () => {
    const hint = metricHelpHint('shared.sessions');
    expect(typeof hint === 'string' || (hint && 'body' in hint)).toBe(true);
  });
});

describe('normalizeHintContent', () => {
  it('parses string and object hints', async () => {
    const { normalizeHintContent } = await import('@/components/HelpHint');
    expect(normalizeHintContent('plain')).toEqual({ body: 'plain' });
    expect(normalizeHintContent({ title: 'T', body: 'B' })).toEqual({ title: 'T', body: 'B' });
    expect(normalizeHintContent(undefined)).toBeUndefined();
  });
});
