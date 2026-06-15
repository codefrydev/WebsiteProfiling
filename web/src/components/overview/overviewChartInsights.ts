import type { ReportPayload } from '@/types';
import { strings, format } from '@/lib/strings';
import { crawledUrlCount } from '@/lib/crawlCounts';
import { SEMANTIC } from '@/utils/chartPalette';
import {
  buildViewHref,
  pctOfCrawl,
  selectCrawlConcerns,
  successRateBand,
  medianWordsBand,
  responseTimeBand,
  ogCoverageBand,
  type CrawlConcern,
} from './crawlSnapshotMetrics';

const vo = strings.views.overview;

export function wordCountBucketColors(labels: string[]): string[] {
  const thin = new Set(['0-100', '101-300']);
  const fair = new Set(['301-600']);
  return labels.map((label) => {
    if (thin.has(label)) return SEMANTIC.poor;
    if (fair.has(label)) return SEMANTIC.warn;
    return SEMANTIC.good;
  });
}

export function responseTimeBucketColors(labels: string[]): string[] {
  const slow = new Set(['1-2s', '>2s']);
  const fair = new Set(['500ms-1s']);
  return labels.map((label) => {
    if (slow.has(label)) return SEMANTIC.poor;
    if (fair.has(label)) return SEMANTIC.warn;
    return SEMANTIC.good;
  });
}

export function titleMetaBucketColors(): string[] {
  return [SEMANTIC.poor, SEMANTIC.warn, SEMANTIC.warn, SEMANTIC.good];
}

export function dominantBucketLabel(
  labels: string[],
  values: number[],
): { label: string; count: number; pct: number } | null {
  if (!labels.length || !values.length) return null;
  let maxIdx = 0;
  let maxVal = 0;
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  values.forEach((v, i) => {
    if (v > maxVal) {
      maxVal = v;
      maxIdx = i;
    }
  });
  return {
    label: labels[maxIdx],
    count: maxVal,
    pct: Math.round((maxVal / total) * 1000) / 10,
  };
}

export function thinWordCountPages(dist: Record<string, number> | undefined): number {
  if (!dist) return 0;
  return Number(dist['0-100'] || 0) + Number(dist['101-300'] || 0);
}

export function slowResponseUrls(dist: Record<string, number> | undefined): number {
  if (!dist) return 0;
  return Number(dist['1-2s'] || 0) + Number(dist['>2s'] || 0);
}

export function titleMetaProblemPages(seo: ReportPayload['seo_health']): number {
  if (!seo) return 0;
  return (
    Number(seo.missing_title || 0) +
    Number(seo.title_short || 0) +
    Number(seo.title_long || 0) +
    Number(seo.missing_meta_desc || 0) +
    Number(seo.meta_desc_short || 0) +
    Number(seo.meta_desc_long || 0)
  );
}

export interface ChartInsightContext {
  querySuffix: string;
  data: ReportPayload;
}

export function buildChartViewHrefs(querySuffix: string) {
  return {
    links: buildViewHref('links', querySuffix),
    content: buildViewHref('content', querySuffix),
    contentAnalytics: buildViewHref('content-analytics', querySuffix),
    network: buildViewHref('network', querySuffix),
    techStack: buildViewHref('tech-stack', querySuffix),
    lighthouse: buildViewHref('lighthouse', querySuffix),
  };
}

export function selectChartConcerns(ctx: ChartInsightContext, limit = 5): CrawlConcern[] {
  const s = ctx.data.summary || {};
  const crawledCount = crawledUrlCount(ctx.data);
  const brokenCount = (s.count_4xx || 0) + (s.count_5xx || 0);
  const h1Zero = ctx.data.seo_health?.h1_zero ?? 0;
  const medianWords =
    ctx.data.content_analytics?.word_count_stats?.median != null
      ? Math.round(ctx.data.content_analytics.word_count_stats.median)
      : null;
  const p50 = ctx.data.response_time_stats?.p50 ?? null;
  const hrefs = buildChartViewHrefs(ctx.querySuffix);

  const concerns = selectCrawlConcerns({
    brokenCount,
    h1Zero,
    crawledCount,
    successRate: s.success_rate,
    medianWords,
    responseP50: p50,
    linksHref: hrefs.links,
    contentHref: hrefs.content,
    contentAnalyticsHref: hrefs.contentAnalytics,
    chartsHref: buildViewHref('overview', ctx.querySuffix, { tab: 'charts' }),
    formatBroken: (count, pct) => format(vo.crawlConcernBroken, { count, pct }),
    formatMissingH1: (count, pct) => format(vo.crawlConcernMissingH1, { count, pct }),
    formatSuccess: (rate) => format(vo.crawlConcernSuccess, { rate }),
    formatThinContent: (median) => format(vo.crawlConcernThinContent, { median }),
    formatSlowResponse: (ms) => format(vo.crawlConcernSlowResponse, { ms }),
  }, limit);

  const titleMetaProblems = titleMetaProblemPages(ctx.data.seo_health);
  if (titleMetaProblems > 0) {
    const pct = pctOfCrawl(titleMetaProblems, crawledCount);
    concerns.push({
      id: 'title-meta',
      label: format(vo.chartsConcernTitleMeta, {
        count: titleMetaProblems.toLocaleString(),
        pct: pct != null ? `${pct}%` : '—',
      }),
      href: hrefs.content,
      severity: 75 + titleMetaProblems,
    });
  }

  const mixed = Boolean(ctx.data.language_summary?.mixed_site);
  if (mixed) {
    concerns.push({
      id: 'mixed-lang',
      label: vo.contentQualityKpiMixedLanguage,
      href: buildViewHref('text-content-analysis', ctx.querySuffix),
      severity: 40,
    });
  }

  return concerns.sort((a, b) => b.severity - a.severity).slice(0, limit);
}

export function statusDistributionTakeaway(
  statusCounts: Record<string, number> | undefined,
  crawledCount: number,
): string | undefined {
  if (!statusCounts || crawledCount <= 0) return undefined;
  let broken = 0;
  Object.entries(statusCounts).forEach(([code, raw]) => {
    const n = parseInt(String(code).trim(), 10);
    if (!Number.isNaN(n) && n >= 400 && n < 600) broken += Number(raw) || 0;
  });
  if (broken <= 0) return vo.chartsTakeawayStatusGood;
  const pct = pctOfCrawl(broken, crawledCount);
  return format(vo.chartsTakeawayStatusBroken, {
    count: broken.toLocaleString(),
    pct: pct != null ? `${pct}%` : '—',
  });
}

export function wordCountTakeaway(dist: Record<string, number> | undefined, crawledCount: number): string | undefined {
  if (!dist) return undefined;
  const knownKeys = vo.wcBuckets.filter((k) => k in dist);
  const knownValues = knownKeys.map((k) => Number(dist[k] || 0));
  const total = knownValues.reduce((a, v) => a + v, 0);
  if (total <= 0) return undefined;
  const thin = thinWordCountPages(dist);
  const dominant = dominantBucketLabel(knownKeys, knownValues);
  if (thin > 0 && thin / total >= 0.25) {
    const pct = Math.round((thin / total) * 1000) / 10;
    return format(vo.chartsTakeawayThinContent, { count: thin.toLocaleString(), pct });
  }
  if (dominant) {
    return format(vo.chartsTakeawayWordCountDominant, {
      bucket: dominant.label,
      count: dominant.count.toLocaleString(),
      pct: dominant.pct,
    });
  }
  return undefined;
}

export function responseTimeTakeaway(dist: Record<string, number> | undefined): string | undefined {
  if (!dist) return undefined;
  const slow = slowResponseUrls(dist);
  const total = Object.values(dist).reduce((a, v) => a + Number(v || 0), 0);
  if (total <= 0) return undefined;
  if (slow > 0) {
    const pct = Math.round((slow / total) * 1000) / 10;
    return format(vo.chartsTakeawaySlowResponse, { count: slow.toLocaleString(), pct });
  }
  const dominant = dominantBucketLabel(
    vo.rtBuckets.filter((k) => k in dist),
    vo.rtBuckets.filter((k) => k in dist).map((k) => Number(dist[k] || 0)),
  );
  if (dominant) {
    return format(vo.chartsTakeawayResponseDominant, {
      bucket: dominant.label,
      count: dominant.count.toLocaleString(),
      pct: dominant.pct,
    });
  }
  return vo.chartsTakeawayResponseGood;
}

export function depthTakeaway(
  byDepth: Record<string, number> | undefined,
  maxDepth: number | null | undefined,
  avgDepth: number | null | undefined,
): string | undefined {
  if (!byDepth) return undefined;
  const entries = Object.entries(byDepth).map(([k, v]) => [Number(k), Number(v)] as const).filter(([k]) => !Number.isNaN(k));
  if (!entries.length) return undefined;
  const depth1 = entries.find(([d]) => d === 1)?.[1] ?? 0;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total <= 0) return undefined;
  const depth1Pct = Math.round((depth1 / total) * 1000) / 10;
  return format(vo.chartsTakeawayDepth, {
    maxDepth: maxDepth ?? '—',
    avgDepth: avgDepth ?? '—',
    depth1Pct,
  });
}

export function titleMetaTakeaway(seo: ReportPayload['seo_health'], crawledCount: number): string | undefined {
  if (!seo) return undefined;
  const problems = titleMetaProblemPages(seo);
  if (problems <= 0) return vo.chartsTakeawayTitleMetaGood;
  const pct = pctOfCrawl(problems, crawledCount);
  const missingTitle = Number(seo.missing_title || 0);
  const missingMeta = Number(seo.missing_meta_desc || 0);
  return format(vo.chartsTakeawayTitleMetaProblems, {
    count: problems.toLocaleString(),
    pct: pct != null ? `${pct}%` : '—',
    missingTitle: missingTitle.toLocaleString(),
    missingMeta: missingMeta.toLocaleString(),
  });
}

export function socialTakeaway(social: ReportPayload['social_coverage']): string | undefined {
  if (!social) return undefined;
  const og = social.og_coverage_pct;
  const img = social.og_image_coverage_pct;
  if (og != null && og < 70) {
    return format(vo.chartsTakeawaySocialOgLow, { pct: Number(og).toFixed(1) });
  }
  if (img != null && img < 70) {
    return format(vo.chartsTakeawaySocialImageLow, { pct: Number(img).toFixed(1) });
  }
  if (og != null) {
    return format(vo.chartsTakeawaySocialGood, { og: Number(og).toFixed(1) });
  }
  return undefined;
}

export function lighthouseTakeaway(scores: Record<string, number | null>): string | undefined {
  const perf = scores.performance;
  const seo = scores.seo;
  if (perf != null && perf < 50) {
    return format(vo.chartsTakeawayLhPerfLow, { score: perf });
  }
  if (seo != null && seo < 80) {
    return format(vo.chartsTakeawayLhSeoLow, { score: seo });
  }
  const avg = ['performance', 'accessibility', 'best-practices', 'seo']
    .map((k) => scores[k])
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (!avg.length) return undefined;
  const mean = Math.round(avg.reduce((a, b) => a + b, 0) / avg.length);
  return format(vo.chartsTakeawayLhGood, { score: mean });
}

export function socialCoverageBand(pct: number | null | undefined): 'good' | 'fair' | 'critical' {
  return ogCoverageBand(pct);
}
