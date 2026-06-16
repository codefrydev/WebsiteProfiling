'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Cpu,
  FileCode,
  Globe,
  Share,
  Timer,
} from 'lucide-react';
import type { ReportPayload } from '@/types';
import { strings, format } from '@/lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { crawledUrlCount } from '@/lib/crawlCounts';
import { Card, StatCard } from '@/components';
import CountUp from '@/components/CountUp';
import {
  bandClassName,
  brokenSubline,
  buildViewHref,
  medianWordsBand,
  metricBandLabel,
  ogCoverageBand,
  pctOfCrawl,
  responseTimeBand,
  selectCrawlConcerns,
  successRateBand,
} from './crawlSnapshotMetrics';

const vo = strings.views.overview;
const sj = strings.common;

export interface OverviewCrawlMetricsProps {
  data: ReportPayload;
  querySuffix: string;
}

function MetricSection({
  title,
  hint,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string;
  hint: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-bright">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        {viewAllHref && viewAllLabel ? (
          <Link href={viewAllHref} className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline">
            {viewAllLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 items-stretch gap-4 lg:grid-cols-4">{children}</div>
    </div>
  );
}

export function OverviewCrawlMetrics({ data, querySuffix }: OverviewCrawlMetricsProps) {
  const s = data.summary || {};
  const crawledCount = crawledUrlCount(data);
  const brokenCount = (s.count_4xx || 0) + (s.count_5xx || 0);
  const h1Zero = data.seo_health?.h1_zero ?? 0;
  const successRate = s.success_rate ?? null;
  const medianWords =
    data.content_analytics?.word_count_stats?.median != null
      ? Math.round(data.content_analytics.word_count_stats.median)
      : null;
  const ogPct = data.social_coverage?.og_coverage_pct ?? null;
  const techCount = data.tech_stack_summary?.technologies?.length ?? null;
  const p50 = data.response_time_stats?.p50 ?? null;
  const p95 = data.response_time_stats?.p95 ?? null;

  const linksHref = buildViewHref('links', querySuffix);
  const contentHref = buildViewHref('content', querySuffix);
  const contentAnalyticsHref = buildViewHref('content-analytics', querySuffix);
  const techHref = buildViewHref('tech-stack', querySuffix);
  const networkHref = buildViewHref('network', querySuffix);
  const chartsHref = buildViewHref('overview', querySuffix, { tab: 'charts' });

  const successBand = successRateBand(successRate);
  const wordsBand = medianWordsBand(medianWords);
  const responseBand = responseTimeBand(p50);
  const ogBand = ogCoverageBand(ogPct);
  const h1Pct = pctOfCrawl(h1Zero, crawledCount);

  const concerns = selectCrawlConcerns({
    brokenCount,
    h1Zero,
    crawledCount,
    successRate,
    medianWords,
    responseP50: p50,
    linksHref,
    contentHref,
    contentAnalyticsHref,
    chartsHref,
    formatBroken: (count, pct) => format(vo.crawlConcernBroken, { count, pct }),
    formatMissingH1: (count, pct) => format(vo.crawlConcernMissingH1, { count, pct }),
    formatSuccess: (rate) => format(vo.crawlConcernSuccess, { rate }),
    formatThinContent: (median) => format(vo.crawlConcernThinContent, { median }),
    formatSlowResponse: (ms) => format(vo.crawlConcernSlowResponse, { ms }),
  });

  return (
    <Card shadow className="mb-8 overflow-hidden border border-default">
      <div className="border-b border-muted/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-bright">{vo.crawlSnapshotTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{vo.crawlSnapshotSubtitle}</p>
          </div>
          <Link
            href={chartsHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-700/50"
          >
            <BarChart3 className="h-4 w-4" />
            {vo.crawlSnapshotViewCharts}
          </Link>
        </div>

        {concerns.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {vo.crawlTopConcerns}
            </p>
            <div className="flex flex-wrap gap-2">
              {concerns.map((concern) => (
                <Link
                  key={concern.id}
                  href={concern.href}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/15"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                  <span className="truncate">{concern.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-6 p-4 sm:p-5">
        <MetricSection title={vo.crawlHealthSection} hint={vo.crawlHealthSectionHint} viewAllHref={linksHref} viewAllLabel={vo.crawlOpenLinks}>
          <StatCard
            shadow
            href={linksHref}
            icon={<Globe className="h-4 w-4 shrink-0" aria-hidden />}
            label={vo.totalUrls}
            value={<CountUp value={crawledCount} />}
            sub={vo.crawlPagesDiscovered}
            hint={metricHelpHint('views.overview.totalUrls')}
            fillHeight
          />
          <StatCard
            shadow
            href={linksHref}
            icon={<CheckCircle className="h-4 w-4 shrink-0 text-green-500" aria-hidden />}
            label={vo.successRate}
            value={successRate != null ? `${successRate}%` : '—'}
            band={successRate != null ? metricBandLabel(successBand, vo) : undefined}
            bandClassName={successRate != null ? bandClassName(successBand) : undefined}
            valueClassName={successRate != null ? bandClassName(successBand) : 'text-muted-foreground'}
            hint={metricHelpHint('shared.successRate')}
            fillHeight
          />
          <StatCard
            shadow
            href={linksHref}
            icon={<AlertTriangle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />}
            label={vo.broken}
            value={<CountUp value={brokenCount} />}
            sub={brokenSubline(
              s.count_4xx ?? 0,
              s.count_5xx ?? 0,
              crawledCount,
              (count, pct) => format(vo.crawlMetricCountPct, { count, pct }),
              (count4xx, count5xx) => format(vo.count4xx5xx, { count4xx, count5xx }),
            )}
            band={brokenCount > 0 ? vo.metricBandCritical : vo.metricBandGood}
            bandClassName={brokenCount > 0 ? bandClassName('critical') : bandClassName('good')}
            valueClassName={brokenCount > 0 ? bandClassName('critical') : bandClassName('good')}
            className={brokenCount > 0 ? 'border-red-900/30 ring-1 ring-inset ring-red-500/20' : ''}
            hint={metricHelpHint('views.overview.brokenLinks')}
            fillHeight
          />
          <StatCard
            shadow
            href={contentHref}
            icon={<FileCode className="h-4 w-4 shrink-0 text-yellow-500" aria-hidden />}
            label={vo.missingH1s}
            value={<CountUp value={h1Zero} />}
            sub={
              h1Pct != null
                ? format(vo.crawlMetricCountPct, { count: h1Zero.toLocaleString(), pct: `${h1Pct}%` })
                : undefined
            }
            band={h1Zero > 0 ? vo.metricBandNeedsAttention : vo.metricBandGood}
            bandClassName={h1Zero > 0 ? bandClassName('fair') : bandClassName('good')}
            valueClassName={h1Zero > 0 ? bandClassName('fair') : bandClassName('good')}
            hint={metricHelpHint('views.overview.missingH1')}
            fillHeight
          />
        </MetricSection>

        <MetricSection
          title={vo.crawlContentSection}
          hint={vo.crawlContentSectionHint}
          viewAllHref={contentAnalyticsHref}
          viewAllLabel={vo.crawlOpenContentAnalytics}
        >
          <StatCard
            shadow
            href={contentAnalyticsHref}
            icon={<BookOpen className="h-4 w-4 shrink-0" aria-hidden />}
            label={vo.medianWordCount}
            value={medianWords != null ? <CountUp value={medianWords} /> : sj.emDash}
            sub={vo.perPage2xx}
            band={medianWords != null ? metricBandLabel(wordsBand, vo) : undefined}
            bandClassName={medianWords != null ? bandClassName(wordsBand) : undefined}
            valueClassName={medianWords != null ? bandClassName(wordsBand) : 'text-bright'}
            hint={metricHelpHint('shared.medianWords')}
            fillHeight
          />
          <StatCard
            shadow
            href={contentHref}
            icon={<Share className="h-4 w-4 shrink-0 text-link" aria-hidden />}
            label={vo.ogCoverage}
            value={ogPct != null ? `${ogPct}%` : sj.emDash}
            sub={vo.ogPagesWith}
            band={ogPct != null ? metricBandLabel(ogBand, vo) : undefined}
            bandClassName={ogPct != null ? bandClassName(ogBand) : undefined}
            valueClassName={ogPct != null ? bandClassName(ogBand) : 'text-bright'}
            hint={metricHelpHint('views.overview.ogCoverage')}
            fillHeight
          />
          <StatCard
            shadow
            href={techHref}
            icon={<Cpu className="h-4 w-4 shrink-0 text-purple-700 dark:text-purple-400" aria-hidden />}
            label={vo.technologies}
            value={techCount != null ? <CountUp value={techCount} /> : sj.emDash}
            sub={vo.techDetectedAcross}
            hint={metricHelpHint('views.overview.technologies')}
            fillHeight
          />
          <StatCard
            shadow
            href={networkHref}
            icon={<Timer className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />}
            label={vo.responseP50}
            value={p50 != null ? `${Math.round(p50)}ms` : sj.emDash}
            sub={
              p95 != null
                ? `${vo.p95Label} ${Math.round(p95)}ms`
                : undefined
            }
            band={p50 != null ? metricBandLabel(responseBand, vo) : undefined}
            bandClassName={p50 != null ? bandClassName(responseBand) : undefined}
            valueClassName={p50 != null ? bandClassName(responseBand) : 'text-bright'}
            hint={metricHelpHint('views.overview.responseP50')}
            fillHeight
          />
        </MetricSection>
      </div>
    </Card>
  );
}
