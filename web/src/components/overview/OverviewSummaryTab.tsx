'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Globe,
  CheckCircle,
  AlertTriangle,
  FileCode,
  BookOpen,
  Share,
  Cpu,
  Timer,
  TrendingUp,
  ChevronRight,
  Sparkles,
  ArrowLeftRight,
  FileDown,
} from 'lucide-react';
import type { ReportPayload } from '@/types';
import type { DataSourceId } from '@/lib/dataProvenance';
import { strings, format } from '@/lib/strings';
import { crawledUrlCount } from '@/lib/crawlCounts';
import { googleSnapshotStatus } from '@/lib/googleSnapshot';
import { Card, AlertBanner, StatCard } from '@/components';
import { DataSourceBadgeRow } from '@/components/DataSourceBadge';
import LlmDisclosure from '@/components/LlmDisclosure';
import { OverviewTabPanel } from './OverviewTabPanel';
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
  const sj = strings.common;
  const searchParams = useSearchParams();
  const [healthDelta, setHealthDelta] = useState<number | null>(null);
  const keywordsHref = useMemo(
    () => buildKeywordsHref(searchParams.toString()),
    [searchParams],
  );

  const s = data.summary || {};
  const crawledCount = crawledUrlCount(data);
  const healthScore = (data.categories || [])
    .map((c) => Number(c?.score))
    .filter((n) => Number.isFinite(n));
  const currentHealth =
    healthScore.length > 0
      ? Math.round(healthScore.reduce((a, b) => a + b, 0) / healthScore.length)
      : null;

  useEffect(() => {
    const domain = data.site_name || '';
    if (!domain) return;
    void fetch(`/api/report/history?domain=${encodeURIComponent(domain)}&limit=2`)
      .then((r) => r.json())
      .then((payload: { history?: Array<{ healthScore?: number | null }> }) => {
        const hist = payload.history || [];
        if (hist.length >= 2 && currentHealth != null && hist[1]?.healthScore != null) {
          setHealthDelta(currentHealth - Number(hist[1].healthScore));
        }
      })
      .catch(() => {});
  }, [data.site_name, currentHealth]);

  const execTopIssues = (data.executive_summary?.top_issues || []).slice(0, 5);
  const execPriorities = (data.executive_summary?.priorities || []).filter(Boolean);
  const execSource = data.executive_summary?.source;
  const fallbackTopIssues = (data.categories || [])
    .flatMap((cat) =>
      (cat.issues || []).map((iss) => ({
        ...iss,
        category: cat.name || cat.id,
      })),
    )
    .filter((iss) => iss.priority === 'Critical' || iss.priority === 'High')
    .slice(0, 3);
  const topIssues = execTopIssues.length > 0 ? execTopIssues : fallbackTopIssues;
  const h1Zero = (data.seo_health && data.seo_health.h1_zero) || 0;
  const brokenCount = (s.count_4xx || 0) + (s.count_5xx || 0);
  const googleData = data.google;
  const googleSnap = googleSnapshotStatus(googleData);
  const metaSources = (data.report_meta?.data_sources || []) as string[];
  const provenanceSources: DataSourceId[] = metaSources
    .map((src) => {
      if (src === 'search_console') return 'search_console';
      if (src === 'analytics') return 'analytics';
      if (src === 'lighthouse') return 'lighthouse';
      if (src === 'estimated') return 'estimated';
      if (src === 'ai') return 'ai';
      return 'crawl';
    })
    .filter((v, i, a) => a.indexOf(v) === i) as DataSourceId[];

  const showContentIntelligence =
    (data.content_duplicates?.length ?? 0) > 0 ||
    (data.language_summary?.counts && Object.keys(data.language_summary.counts).length > 0) ||
    (data.semantic_keyword_clusters?.length ?? 0) > 0 ||
    (data.ner_site_summary?.label_counts && Object.keys(data.ner_site_summary.label_counts).length > 0);

  const execSummary = data.executive_summary?.summary;
  const gscClicks = data.google?.gsc?.summary?.clicks;

  return (
    <OverviewTabPanel tabId="summary" className="space-y-6">
      <div className="space-y-4">
        {(execSummary || currentHealth != null) && (
          <Card padding="tight">
            {currentHealth != null && (
              <p className="text-sm text-foreground mb-2">
                <span className="font-semibold">Audit health:</span> {currentHealth}/100
                {healthDelta != null && healthDelta !== 0 && (
                  <span className={healthDelta > 0 ? ' text-emerald-600' : ' text-rose-600'}>
                    {' '}
                    ({healthDelta > 0 ? '+' : ''}
                    {healthDelta} vs prior run)
                  </span>
                )}
              </p>
            )}
            {execSummary ? (
              <>
                {execSource === 'ai_insights' ? (
                  <p className="text-[10px] uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300 font-semibold mb-1">
                    {vo.executiveAiLabel}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{execSummary}</p>
              </>
            ) : null}
            {execPriorities.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm list-disc pl-5 text-foreground">
                {execPriorities.map((line, i) => (
                  <li key={`${line}-${i}`}>{line}</li>
                ))}
              </ul>
            ) : null}
            {gscClicks != null && (
              <p className="text-xs text-muted-foreground mt-2">
                Search Console clicks ({data.report_meta?.google_date_range_days ?? 28}d): {Number(gscClicks).toLocaleString()}
              </p>
            )}
            {topIssues.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  {vo.topTrafficIssues}
                </p>
                <ul className="space-y-1 text-sm">
                  {topIssues.map((iss, i) => {
                    const row = iss as { message?: string; priority?: string; gsc_clicks?: number };
                    const clicks = Number(row.gsc_clicks || 0);
                    return (
                      <li key={`${row.message}-${i}`} className="text-foreground">
                        <span className="text-muted-foreground">[{row.priority}]</span> {row.message}
                        {clicks > 0 ? (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({clicks.toLocaleString()} {vo.clicksLabel})
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        )}
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
                <StatCard label={vo.gscClicksCard} value={googleData.gsc.summary?.clicks?.toLocaleString()} />
                <StatCard label={vo.gscImpressionsCard} value={googleData.gsc.summary?.impressions?.toLocaleString()} />
              </>
            ) : null}
            {googleData.ga4 ? (
              <>
                <StatCard label={vo.ga4SessionsCard} value={googleData.ga4.summary?.sessions?.toLocaleString()} />
                <StatCard label={vo.ga4UsersCard} value={googleData.ga4.summary?.activeUsers?.toLocaleString()} />
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" /> {vo.totalUrls}
          </div>
          <div className="text-3xl font-bold text-bright">{crawledCount.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-2">{s.avg_outlinks ?? 0} {vo.avgOutlinks}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" /> {vo.successRate}
          </div>
          <div className="text-3xl font-bold text-green-700 dark:text-green-400">{s.success_rate ?? 0}%</div>
        </Card>
        <Card shadow className="border-red-900/30 ring-1 ring-red-500/20">
          <div className="text-red-700 dark:text-red-400/90 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {vo.broken}
          </div>
          <div className="text-3xl font-bold text-red-500">{brokenCount}</div>
          <div className="text-xs text-muted-foreground mt-2">
            {format(vo.count4xx5xx, { count4xx: s.count_4xx ?? 0, count5xx: s.count_5xx ?? 0 })}
          </div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" /> {vo.missingH1s}
          </div>
          <div className="text-3xl font-bold text-yellow-500">{h1Zero}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {vo.medianWordCount}
          </div>
          <div className="text-3xl font-bold text-bright">
            {data.content_analytics?.word_count_stats?.median != null
              ? Math.round(data.content_analytics.word_count_stats.median).toLocaleString()
              : sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{vo.perPage2xx}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Share className="h-4 w-4 text-link" /> {vo.ogCoverage}
          </div>
          <div className="text-3xl font-bold text-link">
            {data.social_coverage?.og_coverage_pct != null ? `${data.social_coverage.og_coverage_pct}%` : sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{vo.ogPagesWith}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-700 dark:text-purple-400" /> {vo.technologies}
          </div>
          <div className="text-3xl font-bold text-purple-700 dark:text-purple-400">
            {data.tech_stack_summary?.technologies?.length ?? sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{vo.techDetectedAcross}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Timer className="h-4 w-4 text-amber-700 dark:text-amber-400" /> {vo.responseP50}
          </div>
          <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">
            {data.response_time_stats?.p50 != null ? `${Math.round(data.response_time_stats.p50)}ms` : sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {vo.p95Label}{' '}
            {data.response_time_stats?.p95 != null ? `${Math.round(data.response_time_stats.p95)}ms` : sj.emDash}
          </div>
        </Card>
      </div>

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

      <OverviewKeywordOpportunitiesCard
        keywords={data.keywords}
        keywordOpportunities={data.keyword_opportunities}
        contentAnalytics={data.content_analytics}
        keywordsHref={keywordsHref}
        hasGoogleConnected={Boolean(googleData)}
      />

      {showContentIntelligence ? (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-700 dark:text-violet-400" />
            {vo.contentIntelligence}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Card shadow>
              <div className="text-violet-800/90 dark:text-violet-400/80 text-xs font-bold uppercase tracking-wider mb-2">
                {vo.duplicateGroups}
              </div>
              <div className="text-3xl font-bold text-violet-800 dark:text-violet-300">
                {data.content_duplicates?.length ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-2">{vo.nearDuplicateGroups}</div>
            </Card>
            <Card shadow>
              <div className="text-emerald-800/90 dark:text-emerald-400/80 text-xs font-bold uppercase tracking-wider mb-2">
                {vo.parentTopics}
              </div>
              <div className="text-3xl font-bold text-emerald-800 dark:text-emerald-300">
                {data.semantic_keyword_clusters?.length ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-2">{vo.semanticGroups}</div>
            </Card>
            <Card shadow>
              <div className="text-cyan-800/90 dark:text-cyan-400/80 text-xs font-bold uppercase tracking-wider mb-2">
                {vo.namedEntities}
              </div>
              <div className="text-3xl font-bold text-cyan-800 dark:text-cyan-300">
                {data.ner_site_summary?.total_entities != null
                  ? data.ner_site_summary.total_entities.toLocaleString()
                  : sj.emDash}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {data.ner_site_summary?.pages_with_ner != null
                  ? format(vo.pagesSampled, { n: data.ner_site_summary.pages_with_ner })
                  : vo.entitiesSitewide}
              </div>
            </Card>
            <Card shadow className="col-span-2 lg:col-span-3">
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">
                {vo.languagesSampled}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.language_summary?.counts || {})
                  .slice(0, 8)
                  .map(([lang, n]) => (
                    <span
                      key={lang}
                      className="text-xs font-mono px-2 py-1 rounded-lg bg-brand-900 border border-default text-foreground"
                    >
                      {lang}: {String(n)}
                    </span>
                  ))}
                {(!data.language_summary?.counts || Object.keys(data.language_summary.counts).length === 0) && (
                  <span className="text-xs text-muted-foreground">{sj.emDash}</span>
                )}
              </div>
              {data.language_summary?.mixed_site && (
                <p className="text-xs text-amber-800 dark:text-yellow-400/80 mt-2">{vo.mixedLanguage}</p>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </OverviewTabPanel>
  );
}
