import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ExternalLink,
  Gauge,
  Globe,
  Sparkles,
  Timer,
  Trash2,
} from 'lucide-react';
import { LabelWithHint } from '@/components';
import Sparkline, { type SparklineMode } from '@/components/Sparkline';
import { DataSourceBadgeRow } from '@/components/DataSourceBadge';
import { PRIORITY_CONFIG } from '@/lib/issuePriority';
import { format, strings } from '@/lib/strings';
import {
  formatPortfolioCrawlSummary,
  hasPortfolioCrawlConfig,
} from '@/lib/portfolioCrawlConfig';
import type { PortfolioCategorySnapshot, PortfolioGroup } from '@/types';
import {
  derivePortfolioCardTrends,
  healthScoreClass,
  shortCategoryLabel,
} from '@/components/portfolio/portfolioCardUtils';
import { useOptionalPortfolio } from '@/context/usePortfolio';
import { usePortfolioCardHistory } from '@/hooks/usePortfolioCardHistory';
import { useInView } from '@/lib/useInView';

export interface PortfolioPropertyCardProps {
  liteGroup: PortfolioGroup;
  cardKey: string;
  fetchEnabled: boolean;
  confirmOpen: boolean;
  isDeleting: boolean;
  isOpening: boolean;
  onOpen: () => void;
  onDeleteToggle: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}

function domainMonogram(domain: string): string {
  const clean = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  return clean.slice(0, 2).toUpperCase();
}

function PortfolioTrendCell({
  label,
  helpKey,
  values,
  displayValue,
  mode,
}: {
  label: string;
  helpKey?: string;
  values: number[];
  displayValue: string;
  mode: SparklineMode;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low/40 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-md-sys-on-surface-variant truncate">
        {helpKey ? <LabelWithHint label={label} helpKey={helpKey} /> : label}
      </p>
      <div className="flex items-end justify-between gap-1.5 mt-1.5 min-h-[22px]">
        <Sparkline values={values} mode={mode} width={80} height={20} />
        <span className="text-sm font-bold tabular-nums text-md-sys-on-surface shrink-0 leading-none">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

function PortfolioCategoryChip({ cat, issueLabel }: { cat: PortfolioCategorySnapshot; issueLabel: string }) {
  return (
    <div className="rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/50 p-2 text-center min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-md-sys-on-surface-variant truncate" title={cat.name}>
        {shortCategoryLabel(cat)}
      </p>
      <p className={`text-sm font-bold tabular-nums leading-tight mt-0.5 ${healthScoreClass(cat.score)}`}>{cat.score}</p>
      {cat.issueCount > 0 ? (
        <p className="text-[9px] text-md-sys-on-surface-variant tabular-nums truncate mt-0.5">
          {format(issueLabel, { count: cat.issueCount })}
        </p>
      ) : null}
    </div>
  );
}

function PortfolioSignalPill({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-md-sys-warning-container/30 border border-md-sys-warning/30 px-2.5 py-0.5 text-[10px] tabular-nums text-md-sys-warning">
      <span className="text-md-sys-on-surface-variant">{label}</span>
      <span className="font-bold">{value.toLocaleString()}</span>
    </span>
  );
}

function SparklineSkeleton() {
  return (
    <span
      className="shimmer inline-block h-5 w-[72px] rounded-full bg-md-sys-surface-container-high"
      aria-hidden
    />
  );
}

export default function PortfolioPropertyCard({
  liteGroup,
  cardKey,
  fetchEnabled,
  confirmOpen,
  isDeleting,
  isOpening,
  onOpen,
  onDeleteToggle,
  onDeleteCancel,
  onDeleteConfirm,
}: PortfolioPropertyCardProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, rootMargin: '200px' });
  const group = liteGroup;
  const { auditHistory, status: historyStatus } = usePortfolioCardHistory(
    liteGroup.domainParam,
    fetchEnabled && inView && !liteGroup.crawlOnly,
  );
  const portfolio = useOptionalPortfolio();
  const crawlHistory = portfolio?.crawlHistoryByDomain[liteGroup.domainParam] || [];
  const historyLoading =
    fetchEnabled &&
    inView &&
    !liteGroup.crawlOnly &&
    (historyStatus === 'loading' || historyStatus === 'idle');

  const vh = strings.views.home;
  const sj = strings.common;
  const disabled = isOpening || isDeleting;
  const trends = derivePortfolioCardTrends(group, auditHistory, crawlHistory, {
    missingTitlesLabel: vh.missingTitlesLabel,
    missingMetaLabel: vh.missingMetaLabel,
    thinPagesLabel: vh.thinPagesLabel,
    h1IssuesLabel: vh.h1IssuesLabel,
  });
  const crawlConfigSegments = formatPortfolioCrawlSummary(group.crawlConfig);
  const showCrawlConfig = hasPortfolioCrawlConfig(group.crawlConfig);
  const showDataSources = !group.crawlOnly && (group.dataSources?.length ?? 0) > 0;

  return (
    <div ref={ref} className="w-full text-left flex flex-col h-full">
      <div className="group relative flex flex-col justify-between h-full rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-md-sys-primary/45 hover:shadow-[var(--elevation-2)]">
        <div className="space-y-4">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-md-sys-primary-container/40 font-mono text-sm font-bold text-md-sys-primary shadow-xs">
                {domainMonogram(group.domainName)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-base font-bold text-md-sys-on-surface truncate group-hover:text-md-sys-primary transition-colors">
                    {group.domainName}
                  </h3>
                  {group.crawlOnly ? (
                    <span className="rounded-full bg-md-sys-warning-container/40 border border-md-sys-warning/30 px-2 py-0.2 text-[10px] font-semibold text-md-sys-warning">
                      {vh.crawlOnlyBadge}
                    </span>
                  ) : null}
                </div>
                <a
                  href={group.crawlUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-md-sys-on-surface-variant hover:text-md-sys-primary transition-colors"
                  title={group.crawlUrl}
                >
                  <span className="truncate font-mono">{group.crawlUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                </a>
              </div>
            </div>

            <div className="flex items-start gap-2 shrink-0">
              {/* Health Score Pill */}
              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  {!group.crawlOnly && historyLoading ? <SparklineSkeleton /> : null}
                  {!group.crawlOnly && !historyLoading && trends.healthTrend.length >= 1 ? (
                    <Sparkline values={trends.healthTrend} mode="higher-better" width={56} height={18} />
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums shadow-xs ${healthScoreClass(
                      group.healthScore,
                    )} bg-md-sys-surface-container-high border border-md-sys-outline-variant/30`}
                  >
                    {group.healthScore}
                  </span>
                </div>
                {!group.crawlOnly && trends.healthDelta != null && trends.healthDelta !== 0 ? (
                  <p
                    className={`text-[10px] font-semibold tabular-nums mt-0.5 ${
                      trends.healthDelta > 0 ? 'text-md-sys-success' : 'text-md-sys-error'
                    }`}
                  >
                    {trends.healthDelta > 0 ? `+${trends.healthDelta}` : trends.healthDelta} vs prior
                  </p>
                ) : null}
              </div>

              {/* Delete Button */}
              <button
                type="button"
                title={vh.deleteProperty}
                aria-label={vh.deleteProperty}
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteToggle();
                }}
                className="press rounded-full p-1.5 text-md-sys-on-surface-variant hover:text-md-sys-error hover:bg-md-sys-error-container/20 transition-all disabled:opacity-50 active:scale-95"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Delete Confirmation Alert */}
          {confirmOpen ? (
            <div
              className="rounded-2xl border border-md-sys-error/40 bg-md-sys-error-container/20 p-3.5 space-y-2.5 animate-in"
              role="alertdialog"
              aria-labelledby={`delete-title-${cardKey}`}
            >
              <p id={`delete-title-${cardKey}`} className="text-xs font-bold text-md-sys-on-surface">
                {vh.deleteConfirmTitle}
              </p>
              <p className="text-xs text-md-sys-on-surface-variant leading-relaxed">
                {group.crawlOnly
                  ? format(vh.deleteConfirmCrawlOnly, {
                      name: group.domainName,
                      count: group.urlCount.toLocaleString(),
                    })
                  : format(vh.deleteConfirmBody, { name: group.domainName })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="press px-3.5 py-1 text-xs font-semibold rounded-full border border-md-sys-outline-variant/40 text-md-sys-on-surface hover:bg-md-sys-surface-container-high active:scale-[0.98] transition-all"
                  onClick={onDeleteCancel}
                >
                  {vh.deleteCancel}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  className="press px-3.5 py-1 text-xs font-semibold rounded-full bg-md-sys-error text-md-sys-on-error hover:brightness-105 active:scale-[0.98] disabled:opacity-60 transition-all shadow-xs"
                  onClick={onDeleteConfirm}
                >
                  {isDeleting ? vh.deleting : vh.deleteConfirm}
                </button>
              </div>
            </div>
          ) : null}

          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Pages Metric */}
            <div className="rounded-xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low/50 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-md-sys-on-surface-variant flex items-center gap-1">
                <Globe className="h-3 w-3" aria-hidden />
                {vh.urlCountLabel}
              </p>
              <p className="text-base font-bold text-md-sys-on-surface tabular-nums mt-1">
                {group.urlCount.toLocaleString()}
              </p>
              {group.medianResponseMs != null ? (
                <p className="text-[10px] text-md-sys-on-surface-variant tabular-nums truncate mt-0.5">
                  {group.medianResponseMs.toLocaleString()}ms resp
                </p>
              ) : (
                <p className="text-[10px] text-md-sys-on-surface-variant truncate mt-0.5">Pages crawled</p>
              )}
            </div>

            {/* Issues Metric */}
            <div className="rounded-xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low/50 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-md-sys-on-surface-variant flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {vh.totalIssuesLabel}
              </p>
              <p className="text-base font-bold text-md-sys-on-surface tabular-nums mt-1">
                {group.totalIssues.toLocaleString()}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(['Critical', 'High'] as const).map((priority) => {
                  const key = priority.toLowerCase() as keyof typeof group.issueCounts;
                  const count = group.issueCounts[key];
                  if (!count || count <= 0) return null;
                  const cfg = PRIORITY_CONFIG[priority];
                  return (
                    <span key={priority} className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold tabular-nums ${cfg.bg} ${cfg.text}`}>
                      {priority[0]}:{count}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Performance / SEO */}
            <div className="rounded-xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low/50 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-md-sys-on-surface-variant flex items-center gap-1">
                <Gauge className="h-3 w-3" aria-hidden />
                Lighthouse
              </p>
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[10px] text-md-sys-on-surface-variant uppercase">Perf</span>
                  <span className="font-bold tabular-nums text-md-sys-on-surface">{group.perfScore ?? sj.emDash}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[10px] text-md-sys-on-surface-variant uppercase">SEO</span>
                  <span className="font-bold tabular-nums text-md-sys-on-surface">{group.seoScore ?? sj.emDash}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Scores Chips */}
          {!group.crawlOnly && group.categorySnapshots.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-md-sys-on-surface-variant">
                {vh.categoryScoresLabel}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {group.categorySnapshots.slice(0, 4).map((cat) => (
                  <PortfolioCategoryChip key={cat.id} cat={cat} issueLabel={vh.categoryIssueCount} />
                ))}
              </div>
            </div>
          ) : null}

          {/* Connected Data Sources & Signals */}
          {showDataSources || trends.seoSignalItems.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {showDataSources ? <DataSourceBadgeRow sources={group.dataSources!} /> : null}
              {trends.seoSignalItems.slice(0, 2).map((row) => (
                <PortfolioSignalPill key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          ) : null}

          {/* Timestamp & Crawl summary */}
          <div className="flex items-center justify-between border-t border-md-sys-outline-variant/30 pt-2 text-[11px] text-md-sys-on-surface-variant">
            <span className="truncate" title={group.lastAudit || group.lastCrawl || ''}>
              {group.lastAudit ? `Audited: ${group.lastAudit}` : group.lastCrawl ? `Crawled: ${group.lastCrawl}` : 'Ready'}
            </span>
            {group.crawlDurationS != null ? (
              <span className="flex items-center gap-1 tabular-nums shrink-0">
                <Timer className="h-3 w-3" />
                {group.crawlDurationS}s
              </span>
            ) : null}
          </div>
        </div>

        {/* Primary CTA Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={onOpen}
          className="press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-md-sys-primary px-4 py-2.5 text-xs font-semibold text-md-sys-on-primary shadow-xs transition-all duration-200 hover:brightness-105 hover:shadow-[var(--elevation-2)] active:scale-[0.98] disabled:opacity-60"
        >
          <span>{group.crawlOnly ? format(vh.viewUrlsCta, { count: group.urlCount }) : vh.openBrandCta}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
