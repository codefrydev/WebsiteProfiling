
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeftRight,
  ChevronRight,
  LayoutGrid,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Card, HelpHint } from '@/components';
import { CategoryScoreGauge } from '@/components/charts/CategoryScoreGauge';
import { strings, format } from '@/lib/strings';
import type { PortfolioBenchmark, PortfolioBenchmarkStatus } from '@/types/report';
import {
  portfolioDeltaClassName,
  portfolioDeltaNarrative,
  portfolioMedianClassName,
} from './portfolioBenchmarkUtils';

const vo = strings.views.overview;

export interface PortfolioBenchmarkCardProps {
  benchmark?: PortfolioBenchmark | null;
  compareHref?: string;
  reportCount?: number;
  portfolioHref?: string;
  categoriesAnchorId?: string;
}

function PortfolioComparisonBar({
  property,
  median,
}: {
  property: number;
  median: number;
}) {
  const propertyPct = Math.min(100, Math.max(0, property));
  const medianPct = Math.min(100, Math.max(0, median));

  return (
    <div className="space-y-2">
      <div className="relative h-3 overflow-hidden rounded-full bg-brand-900 ring-1 ring-inset ring-default/80">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-link/25"
          style={{ width: `${propertyPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/70"
          style={{ left: `${medianPct}%` }}
          aria-hidden
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-blue-500 bg-blue-600 shadow-sm"
          style={{ left: `calc(${propertyPct}% - 8px)` }}
          aria-hidden
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground tabular-nums">
        <span>0</span>
        <span>
          {format(vo.portfolioMedianMarker, { score: median })}
        </span>
        <span>100</span>
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  message,
  portfolioHref,
}: {
  status: PortfolioBenchmarkStatus;
  message?: string;
  portfolioHref: string;
}) {
  if (!message) return null;

  const isError = status === 'error';
  const ctaLabel =
    status === 'single_property' ? vo.portfolioSinglePropertyCta : vo.portfolioViewPortfolio;

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        isError
          ? 'border-red-500/30 bg-red-500/10'
          : 'border-amber-500/25 bg-amber-500/10'
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertCircle
          className={`h-4 w-4 shrink-0 mt-0.5 ${isError ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
          aria-hidden
        />
        <p className={`text-sm ${isError ? 'text-red-800 dark:text-red-300' : 'text-amber-900 dark:text-amber-100'}`}>
          {message}
        </p>
      </div>
      <Link
        to={portfolioHref}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-default bg-brand-800 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-brand-700/60"
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
        {ctaLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function PortfolioBenchmarkCard({
  benchmark,
  compareHref,
  reportCount = 0,
  portfolioHref = '/',
  categoriesAnchorId = 'overview-health-categories',
}: PortfolioBenchmarkCardProps) {
  if (!benchmark) return null;

  const status = benchmark.status;
  const property = benchmark.property_health_score;
  const median = benchmark.median_health_score;
  const propertyCount = benchmark.property_count;
  const isComparable = status === 'ok' || status == null;
  const delta =
    property != null && median != null ? property - median : null;
  const deltaNarrative = portfolioDeltaNarrative(delta);

  if (!isComparable && property == null && !benchmark.message) return null;

  return (
    <Card shadow className="mb-8 overflow-hidden border border-default">
      <div className="border-b border-muted/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
              <h2 className="text-lg font-bold text-bright">{vo.portfolioBenchmarkTitle}</h2>
              <HelpHint ariaLabel={vo.portfolioBenchmarkHelpTitle} side="bottom">
                {vo.portfolioBenchmarkHelpBody}
              </HelpHint>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{vo.portfolioBenchmarkSubtitle}</p>
            {isComparable && propertyCount != null && propertyCount > 1 ? (
              <p className="mt-2 text-xs font-medium text-foreground">
                {format(vo.portfolioPropertyCount, { count: propertyCount.toLocaleString() })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              to={portfolioHref}
              className="inline-flex items-center gap-2 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-700/50"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
              {vo.portfolioViewPortfolio}
            </Link>
            {compareHref && reportCount > 1 ? (
              <Link
                to={compareHref}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden />
                {vo.portfolioCompareRuns}
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {!isComparable && benchmark.message ? (
          <StatusBanner status={status ?? 'unavailable'} message={benchmark.message} portfolioHref={portfolioHref} />
        ) : null}

        {isComparable && property != null && median != null ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
            <CategoryScoreGauge name={vo.portfolioGaugeLabel} score={property} size="lg" />
            <div className="space-y-4">
              <PortfolioComparisonBar property={property} median={median} />
              <div className="flex flex-wrap items-center gap-3">
                {deltaNarrative ? (
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${portfolioDeltaClassName(delta)}`}>
                    {delta != null && delta < 0 ? (
                      <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
                    ) : delta != null && delta > 0 ? (
                      <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
                    ) : null}
                    {deltaNarrative}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-default/80 bg-brand-900/40 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {vo.portfolioMedianScore}
                  </p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${portfolioMedianClassName(median)}`}>
                    {median}
                  </p>
                </div>
                <div className="rounded-lg border border-default/80 bg-brand-900/40 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {vo.portfolioDelta}
                  </p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${portfolioDeltaClassName(delta)}`}>
                    {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta}`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : property != null ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CategoryScoreGauge name={vo.portfolioNoBenchmarkLabel} score={property} size="md" />
            <Link
              to={`#${categoriesAnchorId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
            >
              {vo.portfolioScrollCategories}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
