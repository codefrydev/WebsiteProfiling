import { historySeries } from '@/lib/portfolioAuditHistory';
import type { PortfolioAuditHistoryPoint } from '@/lib/portfolioAuditHistory';
import { crawlHistorySeries } from '@/lib/portfolioCrawlHistory';
import type { PortfolioCrawlHistoryPoint } from '@/lib/portfolioCrawlHistory';
import type { PortfolioCategorySnapshot, PortfolioGroup } from '@/types';

export const CATEGORY_SHORT_LABELS: Record<string, string> = {
  technical_seo: 'Tech SEO',
  performance: 'Performance',
  core_web_vitals: 'CWV',
  link_health: 'Links',
  security: 'Security',
  html_accessibility: 'A11y',
  mobile: 'Mobile',
  intelligence: 'Content',
};

export function shortCategoryLabel(cat: PortfolioCategorySnapshot): string {
  return CATEGORY_SHORT_LABELS[cat.id] || cat.name.split(' ').slice(0, 2).join(' ');
}

export function healthScoreClass(score: number): string {
  if (score >= 80) return 'text-emerald-700 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-700 dark:text-amber-400';
  return 'text-rose-700 dark:text-rose-400';
}

export function portfolioCardKey(group: PortfolioGroup): string {
  return `${group.domainParam}-${group.crawlOnly ? 'crawl' : 'report'}-${group.reportId ?? 'nr'}-${group.crawlRunId ?? 'nc'}-${group.generatedAtMs}`;
}

export interface PortfolioCardTrends {
  healthTrend: number[];
  perfTrend: number[];
  seoTrend: number[];
  issuesTrend: number[];
  pagesTrend: number[];
  titleTrend: number[];
  wordsTrend: number[];
  hasAuditTrendLines: boolean;
  hasCrawlTrendLines: boolean;
  healthDelta: number | null;
  urgentCount: number;
  seoSignalItems: Array<{ label: string; value: number }>;
}

export function derivePortfolioCardTrends(
  group: PortfolioGroup,
  auditHistory: PortfolioAuditHistoryPoint[],
  crawlHistory: PortfolioCrawlHistoryPoint[],
  signalLabels: {
    missingTitlesLabel: string;
    missingMetaLabel: string;
    thinPagesLabel: string;
    h1IssuesLabel: string;
  },
): PortfolioCardTrends {
  const healthTrend = historySeries(auditHistory, 'healthScore');
  const perfTrend = historySeries(auditHistory, 'perfScore');
  const seoTrend = historySeries(auditHistory, 'seoScore');
  const issuesTrend = historySeries(auditHistory, 'totalIssues');
  const pagesTrend = crawlHistorySeries(crawlHistory, 'pagesDiscovered');
  const titleTrend = crawlHistorySeries(crawlHistory, 'titleCoverage');
  const wordsTrend = crawlHistorySeries(crawlHistory, 'avgWordCount');
  const priorHealth =
    auditHistory.length >= 2 ? auditHistory[auditHistory.length - 2].healthScore : null;
  const healthDelta =
    priorHealth != null && Number.isFinite(priorHealth) ? group.healthScore - priorHealth : null;
  const seoSignalItems = group.seoSignals
    ? [
        { label: signalLabels.missingTitlesLabel, value: group.seoSignals.missingTitles },
        { label: signalLabels.missingMetaLabel, value: group.seoSignals.missingMetaDesc },
        { label: signalLabels.thinPagesLabel, value: group.seoSignals.thinContent },
        { label: signalLabels.h1IssuesLabel, value: group.seoSignals.h1Issues },
      ].filter((row) => row.value > 0)
    : [];

  return {
    healthTrend,
    perfTrend,
    seoTrend,
    issuesTrend,
    pagesTrend,
    titleTrend,
    wordsTrend,
    hasAuditTrendLines: auditHistory.length >= 1,
    hasCrawlTrendLines: crawlHistory.length >= 1,
    healthDelta,
    urgentCount: group.issueCounts.critical + group.issueCounts.high,
    seoSignalItems,
  };
}
