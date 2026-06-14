import type { ViewId } from '@/routes';
import { viewIdToPathSlug } from '@/routes';

export type MetricBand = 'good' | 'fair' | 'critical';

export interface CrawlConcern {
  id: string;
  label: string;
  href: string;
  severity: number;
}

export function pctOfCrawl(count: number, total: number): number | null {
  if (total <= 0 || count <= 0) return null;
  return Math.round((count / total) * 1000) / 10;
}

export function successRateBand(rate: number | null | undefined): MetricBand {
  if (rate == null || !Number.isFinite(rate)) return 'fair';
  if (rate >= 90) return 'good';
  if (rate >= 80) return 'fair';
  return 'critical';
}

export function medianWordsBand(median: number | null | undefined): MetricBand {
  if (median == null || !Number.isFinite(median)) return 'fair';
  if (median >= 300) return 'good';
  if (median >= 150) return 'fair';
  return 'critical';
}

export function responseTimeBand(p50Ms: number | null | undefined): MetricBand {
  if (p50Ms == null || !Number.isFinite(p50Ms)) return 'fair';
  if (p50Ms <= 800) return 'good';
  if (p50Ms <= 1500) return 'fair';
  return 'critical';
}

export function ogCoverageBand(pct: number | null | undefined): MetricBand {
  if (pct == null || !Number.isFinite(pct)) return 'fair';
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'fair';
  return 'critical';
}

export function bandClassName(band: MetricBand): string {
  if (band === 'good') return 'text-green-700 dark:text-green-400';
  if (band === 'fair') return 'text-yellow-700 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

export function metricBandLabel(
  band: MetricBand,
  labels: { metricBandGood: string; metricBandFair: string; metricBandCritical: string },
): string {
  if (band === 'good') return labels.metricBandGood;
  if (band === 'fair') return labels.metricBandFair;
  return labels.metricBandCritical;
}

export function valueClassNameForBand(band: MetricBand): string {
  if (band === 'good') return 'text-green-700 dark:text-green-400';
  if (band === 'fair') return 'text-yellow-700 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

export function buildViewHref(
  viewId: ViewId,
  querySuffix: string,
  extraParams?: Record<string, string>,
): string {
  const base = `/${viewIdToPathSlug(viewId)}`;
  const params = new URLSearchParams(querySuffix.startsWith('?') ? querySuffix.slice(1) : querySuffix);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      params.set(key, value);
    }
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export interface CrawlConcernInput {
  brokenCount: number;
  h1Zero: number;
  crawledCount: number;
  successRate: number | null | undefined;
  medianWords: number | null | undefined;
  responseP50: number | null | undefined;
  linksHref: string;
  contentHref: string;
  contentAnalyticsHref: string;
  chartsHref: string;
  formatBroken: (count: string, pct: string) => string;
  formatMissingH1: (count: string, pct: string) => string;
  formatSuccess: (rate: string) => string;
  formatThinContent: (median: string) => string;
  formatSlowResponse: (ms: string) => string;
}

export function selectCrawlConcerns(input: CrawlConcernInput, limit = 3): CrawlConcern[] {
  const concerns: CrawlConcern[] = [];
  const brokenPct = pctOfCrawl(input.brokenCount, input.crawledCount);
  const h1Pct = pctOfCrawl(input.h1Zero, input.crawledCount);

  if (input.brokenCount > 0) {
    concerns.push({
      id: 'broken',
      label: input.formatBroken(
        input.brokenCount.toLocaleString(),
        brokenPct != null ? `${brokenPct}%` : '—',
      ),
      href: input.linksHref,
      severity: 300 + input.brokenCount,
    });
  }

  if (input.h1Zero > 0) {
    concerns.push({
      id: 'h1',
      label: input.formatMissingH1(input.h1Zero.toLocaleString(), h1Pct != null ? `${h1Pct}%` : '—'),
      href: input.contentHref,
      severity: 80 + input.h1Zero,
    });
  }

  const successBand = successRateBand(input.successRate);
  if (successBand === 'critical' && input.successRate != null) {
    concerns.push({
      id: 'success',
      label: input.formatSuccess(String(input.successRate)),
      href: input.linksHref,
      severity: 70,
    });
  }

  const wordsBand = medianWordsBand(input.medianWords);
  if (wordsBand === 'critical' && input.medianWords != null) {
    concerns.push({
      id: 'thin',
      label: input.formatThinContent(String(Math.round(input.medianWords))),
      href: input.contentAnalyticsHref,
      severity: 60,
    });
  }

  const responseBand = responseTimeBand(input.responseP50);
  if (responseBand === 'critical' && input.responseP50 != null) {
    concerns.push({
      id: 'slow',
      label: input.formatSlowResponse(String(Math.round(input.responseP50))),
      href: input.chartsHref,
      severity: 50 + Math.round(input.responseP50 / 100),
    });
  }

  return concerns.sort((a, b) => b.severity - a.severity).slice(0, limit);
}

export function brokenSubline(
  count4xx: number,
  count5xx: number,
  crawledCount: number,
  formatCountPct: (count: string, pct: string) => string,
  formatSplit: (count4xx: number, count5xx: number) => string,
): string {
  const total = count4xx + count5xx;
  const pct = pctOfCrawl(total, crawledCount);
  if (count4xx > 0 && count5xx > 0) {
    return `${formatCountPct(total.toLocaleString(), pct != null ? `${pct}%` : '—')} · ${formatSplit(count4xx, count5xx)}`;
  }
  return formatCountPct(total.toLocaleString(), pct != null ? `${pct}%` : '—');
}
