'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  ChevronRight,
  ArrowLeftRight,
  FileDown,
} from 'lucide-react';
import type { ReportPayload } from '@/types';
import type { DataSourceId } from '@/lib/dataProvenance';
import { strings, format } from '@/lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { googleSnapshotStatus } from '@/lib/googleSnapshot';
import { Card, AlertBanner, StatCard } from '@/components';
import { DataSourceBadgeRow } from '@/components/DataSourceBadge';
import LlmDisclosure from '@/components/LlmDisclosure';
import { OverviewTabPanel } from './OverviewTabPanel';
import { OverviewExecutiveSummary } from './OverviewExecutiveSummary';
import { OverviewCrawlMetrics } from './OverviewCrawlMetrics';
import { OverviewContentQuality } from './OverviewContentQuality';
import {
  OverviewKeywordOpportunitiesCard,
  buildKeywordsHref,
} from './OverviewKeywordOpportunitiesCard';

export interface OverviewSummaryTabProps {
  data: ReportPayload;
  exportHref: string;
  compareHref: string;
  reportCount: number;
}

export function OverviewSummaryTab({ data, exportHref, compareHref, reportCount }: OverviewSummaryTabProps) {
  const vo = strings.views.overview;
  const searchParams = useSearchParams();
  const querySuffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const keywordsHref = useMemo(
    () => buildKeywordsHref(searchParams.toString()),
    [searchParams],
  );

  const { currentHealth, topIssues } = useMemo(() => {
    const scores = (data.categories || [])
      .map((c) => Number(c?.score))
      .filter((n) => Number.isFinite(n));
    const health =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
    const exec = (data.executive_summary?.top_issues || []).slice(0, 5);
    const fallback = (data.categories || [])
      .flatMap((cat) =>
        (cat.issues || []).map((iss) => ({
          ...iss,
          category: cat.name || cat.id,
        })),
      )
      .filter((iss) => iss.priority === 'Critical' || iss.priority === 'High')
      .slice(0, 3);
    return { currentHealth: health, topIssues: exec.length > 0 ? exec : fallback };
  }, [data.categories, data.executive_summary]);

  const googleData = data.google;
  const googleSnap = googleSnapshotStatus(googleData);
  const provenanceSources: DataSourceId[] = useMemo(() => {
    const metaSources = (data.report_meta?.data_sources || []) as string[];
    return metaSources
      .map((src) => {
        if (src === 'search_console') return 'search_console';
        if (src === 'analytics') return 'analytics';
        if (src === 'lighthouse') return 'lighthouse';
        if (src === 'estimated') return 'estimated';
        if (src === 'ai') return 'ai';
        return 'crawl';
      })
      .filter((v, i, a) => a.indexOf(v) === i) as DataSourceId[];
  }, [data.report_meta]);

  return (
    <OverviewTabPanel tabId="summary" className="space-y-6">
      <div className="space-y-4">
        <OverviewExecutiveSummary
          data={data}
          currentHealth={currentHealth}
          topIssues={topIssues}
          compareHref={compareHref}
          reportCount={reportCount}
          querySuffix={querySuffix}
        />
        <OverviewKeywordOpportunitiesCard
          keywords={data.keywords}
          keywordOpportunities={data.keyword_opportunities}
          contentAnalytics={data.content_analytics}
          keywordsHref={keywordsHref}
          hasGoogleConnected={Boolean(googleData)}
        />
        {provenanceSources.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{vo.dataSourcesLabel}:</span>
            <DataSourceBadgeRow sources={provenanceSources} />
            <LlmDisclosure llmMeta={data.report_meta?.llm} />
          </div>
        ) : null}
        {googleSnap.stale && googleData ? (
          <AlertBanner variant="warning">{vo.googleStaleWarning}</AlertBanner>
        ) : null}
        {googleSnap.partial && googleData ? (
          <AlertBanner variant="warning">{vo.googlePartialWarning}</AlertBanner>
        ) : null}
        <div className="print:hidden">
          <Link
            href={exportHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-link hover:underline"
          >
            <FileDown className="h-4 w-4" />
            {vo.openExportPage}
          </Link>
        </div>
        {!googleData ? (
          <AlertBanner
            variant="info"
            icon={<TrendingUp className="h-4 w-4 text-link shrink-0" aria-hidden />}
            title={vo.googleConnectTitle}
          >
            <p className="text-xs text-muted-foreground">{vo.googleConnectSubtitle}</p>
          </AlertBanner>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {googleData.gsc ? (
              <>
                <StatCard
                  label={vo.gscClicksCard}
                  value={googleData.gsc.summary?.clicks?.toLocaleString()}
                  hint={metricHelpHint('shared.clicks')}
                />
                <StatCard
                  label={vo.gscImpressionsCard}
                  value={googleData.gsc.summary?.impressions?.toLocaleString()}
                  hint={metricHelpHint('shared.impressions')}
                />
              </>
            ) : null}
            {googleData.ga4 ? (
              <>
                <StatCard
                  label={vo.ga4SessionsCard}
                  value={googleData.ga4.summary?.sessions?.toLocaleString()}
                  hint={metricHelpHint('shared.sessions')}
                />
                <StatCard
                  label={vo.ga4UsersCard}
                  value={googleData.ga4.summary?.activeUsers?.toLocaleString()}
                  hint={metricHelpHint('shared.activeUsers')}
                />
              </>
            ) : null}
          </div>
        )}

        {(data.ml_errors?.length ?? 0) > 0 ? (
          <AlertBanner
            variant="warning"
            collapsible
            title={format(vo.mlErrors, {
              count: data.ml_errors?.length ?? 0,
              plural: (data.ml_errors?.length ?? 0) !== 1 ? 's' : '',
            })}
          >
            <ul className="space-y-1 text-xs font-mono list-disc pl-5 max-h-48 overflow-y-auto">
              {(data.ml_errors || []).map((err: string, i: number) => (
                <li key={i}>{String(err)}</li>
              ))}
            </ul>
          </AlertBanner>
        ) : null}
      </div>

      <OverviewCrawlMetrics data={data} querySuffix={querySuffix} />

      <OverviewContentQuality data={data} querySuffix={querySuffix} keywordsHref={keywordsHref} />

      {reportCount >= 2 ? (
        <Card shadow className="mb-8 border border-cyan-600/35 dark:border-cyan-900/40 bg-cyan-100/45 dark:bg-cyan-950/10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ArrowLeftRight className="h-5 w-5 text-cyan-700 dark:text-cyan-400 shrink-0" />
                <h2 className="text-lg font-bold text-bright">{vo.reportComparison}</h2>
              </div>
              <p className="text-xs text-muted-foreground max-w-2xl">{vo.reportComparisonTeaser}</p>
            </div>
            <Link
              href={compareHref}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              {strings.views.compare.title}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      ) : null}
    </OverviewTabPanel>
  );
}
