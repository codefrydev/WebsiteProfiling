
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ExternalLink,
  Gauge,
  Globe,
  Timer,
  Trash2,
} from 'lucide-react';
import { Card, LabelWithHint } from '@/components';
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
    <div className="min-w-0 flex-1 rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/25 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant truncate">
        {helpKey ? <LabelWithHint label={label} helpKey={helpKey} /> : label}
      </p>
      <div className="flex items-end justify-between gap-1 mt-1 min-h-[22px]">
        <Sparkline values={values} mode={mode} width={92} height={22} />
        <span className="text-sm font-semibold tabular-nums text-md-sys-on-surface shrink-0 leading-none pb-0.5">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

function PortfolioCategoryChip({ cat, issueLabel }: { cat: PortfolioCategorySnapshot; issueLabel: string }) {
  return (
    <div className="rounded-md border border-md-sys-outline-variant/70 bg-md-sys-surface-container-low/30 px-1.5 py-1 text-center min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-md-sys-on-surface-variant truncate" title={cat.name}>
        {shortCategoryLabel(cat)}
      </p>
      <p className={`text-sm font-bold tabular-nums leading-tight ${healthScoreClass(cat.score)}`}>{cat.score}</p>
      {cat.issueCount > 0 ? (
        <p className="text-[9px] text-md-sys-on-surface-variant tabular-nums truncate">
          {format(issueLabel, { count: cat.issueCount })}
        </p>
      ) : null}
    </div>
  );
}

function PortfolioSignalPill({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-md-sys-warning-container/40 border border-md-sys-warning/20 px-2.5 py-0.5 text-[10px] tabular-nums text-md-sys-on-warning-container">
      <span className="text-md-sys-on-surface-variant">{label}</span>
      <span className="font-semibold">{value.toLocaleString()}</span>
    </span>
  );
}

function SparklineSkeleton() {
  return (
    <span
      className="shimmer inline-block h-5 w-[72px] rounded bg-md-sys-surface-container/90 dark:bg-white/[0.07]"
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
    <div ref={ref} className="relative min-w-[520px] max-w-[600px] shrink-0 text-left">
      <Card
        shadow
        padding="none"
        className="group border-md-sys-outline-variant/90 hover:border-md-sys-primary/45 transition-all duration-200 h-full p-2"
      >
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onOpen}
              className="press min-w-0 flex-1 flex items-start justify-between gap-3 text-left rounded-full -m-1 p-2 hover:bg-md-sys-surface-container-low/60 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  {vh.brandLabel}
                </p>
                <h3 className="text-sm sm:text-[15px] font-semibold text-md-sys-on-surface truncate">{group.domainName}</h3>
                {group.crawlOnly ? (
                  <span className="mt-0.5 inline-block rounded-full bg-md-sys-warning-container px-2 py-0.5 text-[10px] font-medium text-md-sys-on-warning-container">
                    {vh.crawlOnlyBadge}
                  </span>
                ) : null}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">
                  {group.crawlOnly ? (
                    <LabelWithHint label={vh.titleCoverageLabel} helpKey="shared.titleCoverage" />
                  ) : (
                    <LabelWithHint label={vh.healthScoreLabel} helpKey="shared.healthScore" />
                  )}
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  {group.crawlOnly && trends.titleTrend.length >= 1 ? (
                    <Sparkline values={trends.titleTrend} mode="higher-better" width={72} height={20} />
                  ) : null}
                  {!group.crawlOnly && historyLoading ? (
                    <SparklineSkeleton />
                  ) : null}
                  {!group.crawlOnly && !historyLoading && trends.healthTrend.length >= 1 ? (
                    <Sparkline values={trends.healthTrend} mode="higher-better" width={72} height={20} />
                  ) : null}
                  <p className={`text-base font-bold tabular-nums ${healthScoreClass(group.healthScore)}`}>
                    {group.healthScore}
                  </p>
                </div>
                {!group.crawlOnly && trends.healthDelta != null && trends.healthDelta !== 0 ? (
                  <p
                    className={`text-[10px] tabular-nums mt-0.5 ${trends.healthDelta > 0 ? 'text-md-sys-success' : 'text-md-sys-error'}`}
                  >
                    {trends.healthDelta > 0
                      ? format(vh.healthDeltaUp, { delta: trends.healthDelta })
                      : format(vh.healthDeltaDown, { delta: trends.healthDelta })}
                  </p>
                ) : null}
                {!group.crawlOnly && auditHistory.length > 0 ? (
                  <p className="text-[10px] text-md-sys-on-surface-variant tabular-nums mt-0.5">
                    {format(vh.auditRunsLabel, { count: auditHistory.length })}
                  </p>
                ) : null}
              </div>
            </button>
            <button
              type="button"
              title={vh.deleteProperty}
              aria-label={vh.deleteProperty}
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteToggle();
              }}
              className="press shrink-0 rounded-full p-1.5 text-md-sys-on-surface-variant hover:text-md-sys-error hover:bg-md-sys-error/10 transition-all disabled:opacity-50 active:scale-95"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {confirmOpen ? (
            <div
              className="rounded-2xl border border-md-sys-error/30 bg-md-sys-error-container/20 p-3 space-y-2"
              role="alertdialog"
              aria-labelledby={`delete-title-${cardKey}`}
            >
              <p id={`delete-title-${cardKey}`} className="text-xs font-medium text-md-sys-on-surface">
                {vh.deleteConfirmTitle}
              </p>
              <p className="text-[11px] text-md-sys-on-surface-variant leading-snug">
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
                  className="press px-3 py-1 text-[11px] font-medium rounded-full border border-md-sys-outline-variant/40 text-md-sys-on-surface-variant hover:text-md-sys-on-surface active:scale-[0.98] transition-all"
                  onClick={onDeleteCancel}
                >
                  {vh.deleteCancel}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  className="press px-3 py-1 text-[11px] font-medium rounded-full bg-md-sys-error text-md-sys-on-error hover:brightness-105 active:scale-[0.98] disabled:opacity-60 transition-all"
                  onClick={onDeleteConfirm}
                >
                  {isDeleting ? vh.deleting : vh.deleteConfirm}
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/35 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant mb-0.5">{vh.crawlUrlLabel}</p>
            <a
              href={group.crawlUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex max-w-full items-center gap-1 text-xs sm:text-sm text-md-sys-primary hover:underline"
              title={group.crawlUrl}
            >
              <span className="truncate font-mono">{group.crawlUrl}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </a>
          </div>

          {showCrawlConfig || showDataSources ? (
            <div className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/35 px-2 py-1.5 space-y-1.5">
              {showCrawlConfig ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant mb-0.5">
                    {vh.crawlConfigLabel}
                  </p>
                  <p className="text-xs text-md-sys-on-surface leading-snug">{crawlConfigSegments.join(' · ')}</p>
                </div>
              ) : null}
              {showDataSources ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant mb-1">
                    {strings.views.overview.dataSourcesLabel}
                  </p>
                  <DataSourceBadgeRow sources={group.dataSources!} />
                </div>
              ) : null}
            </div>
          ) : null}

          {group.crawlOnly ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-md-sys-surface-container-low/35 px-2 py-1.5 border border-md-sys-outline-variant/40 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">
                      <LabelWithHint label={vh.urlCountLabel} helpKey="views.home.urlCount" />
                    </p>
                    <p className="text-lg leading-none font-semibold text-md-sys-on-surface tabular-nums mt-1">
                      {group.urlCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">
                      <LabelWithHint label={vh.titleCoverageLabel} helpKey="shared.titleCoverage" />
                    </p>
                    <p className="text-lg leading-none font-semibold text-md-sys-on-surface tabular-nums mt-1">
                      {group.titleCoverage != null ? `${group.titleCoverage}%` : sj.emDash}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-md-sys-on-surface truncate border-t border-md-sys-outline-variant/40 pt-2" title={group.lastCrawl || sj.emDash}>
                  <span className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">{vh.lastCrawlLabel}: </span>
                  {group.lastCrawl || sj.emDash}
                </p>
              </div>
              <div className="rounded-md bg-md-sys-surface-container-low/35 px-2 py-1.5 border border-md-sys-outline-variant/40 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">{vh.avgWordCountLabel}</p>
                    <p className="text-lg leading-none font-semibold text-md-sys-on-surface tabular-nums mt-1">
                      {group.avgWordCount != null ? group.avgWordCount.toLocaleString() : sj.emDash}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">{vh.thinPagesLabel}</p>
                    <p className="text-lg leading-none font-semibold text-md-sys-on-surface tabular-nums mt-1">
                      {group.thinPages != null ? group.thinPages.toLocaleString() : sj.emDash}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-md-sys-on-surface-variant leading-snug border-t border-md-sys-outline-variant/40 pt-2">
                  {vh.crawlOnlyHint}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {group.categorySnapshots.length > 0 ? (
                <div className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/30 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant mb-1.5">{vh.categoryScoresLabel}</p>
                  <div className="grid grid-cols-4 gap-1">
                    {group.categorySnapshots.map((cat) => (
                      <PortfolioCategoryChip key={cat.id} cat={cat} issueLabel={vh.categoryIssueCount} />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-md-sys-surface-container-low/35 px-2 py-1.5 border border-md-sys-outline-variant/40">
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">
                    <LabelWithHint label={vh.urlCountLabel} helpKey="views.home.urlCount" />
                  </p>
                  <p className="text-lg font-semibold text-md-sys-on-surface tabular-nums mt-1">{group.urlCount.toLocaleString()}</p>
                  {group.medianWordCount != null ? (
                    <p className="text-[10px] text-md-sys-on-surface-variant mt-1 tabular-nums">
                      {vh.medianWordsLabel}: {group.medianWordCount.toLocaleString()}
                    </p>
                  ) : null}
                  {group.medianResponseMs != null ? (
                    <p className="text-[10px] text-md-sys-on-surface-variant tabular-nums">
                      {format(vh.responseTimeValue, { ms: group.medianResponseMs.toLocaleString() })}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-md bg-md-sys-surface-container-low/35 px-2 py-1.5 border border-md-sys-outline-variant/40">
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    <LabelWithHint label={vh.totalIssuesLabel} helpKey="views.home.totalIssues" />
                  </p>
                  <p className="text-lg font-semibold text-md-sys-on-surface tabular-nums mt-1">{group.totalIssues.toLocaleString()}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(['Critical', 'High', 'Medium', 'Low'] as const).map((priority) => {
                      const key = priority.toLowerCase() as keyof typeof group.issueCounts;
                      const count = group.issueCounts[key];
                      if (count <= 0) return null;
                      const cfg = PRIORITY_CONFIG[priority];
                      return (
                        <span key={priority} className={`px-1.5 py-0.5 rounded text-[9px] tabular-nums ${cfg.bg} ${cfg.text}`}>
                          {priority[0]}
                          {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-md bg-md-sys-surface-container-low/35 px-2 py-1.5 border border-md-sys-outline-variant/40">
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant flex items-center gap-1">
                    <Gauge className="h-3 w-3" aria-hidden />
                    Lighthouse
                  </p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-sm font-semibold tabular-nums">
                      <span className="text-[10px] text-md-sys-on-surface-variant uppercase mr-1">
                        <LabelWithHint label={vh.perfScoreLabel} helpKey="views.home.perfScore" />
                      </span>
                      {group.perfScore ?? sj.emDash}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      <span className="text-[10px] text-md-sys-on-surface-variant uppercase mr-1">
                        <LabelWithHint label={vh.seoScoreLabel} helpKey="views.home.seoScore" />
                      </span>
                      {group.seoScore ?? sj.emDash}
                    </p>
                  </div>
                  {trends.urgentCount > 0 ? (
                    <p className="text-[10px] text-md-sys-error font-medium mt-1 tabular-nums">
                      {vh.trendUrgentLabel}: {trends.urgentCount}
                    </p>
                  ) : null}
                </div>
              </div>

              {(trends.seoSignalItems.length > 0 || group.securityFindings > 0 || group.duplicateClusters > 0) ? (
                <div className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/30 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant mb-1">{vh.seoSignalsLabel}</p>
                  <div className="flex flex-wrap gap-1">
                    {trends.seoSignalItems.map((row) => (
                      <PortfolioSignalPill key={row.label} label={row.label} value={row.value} />
                    ))}
                    <PortfolioSignalPill label={vh.securityFindingsLabel} value={group.securityFindings} />
                    <PortfolioSignalPill label={vh.duplicateContentLabel} value={group.duplicateClusters} />
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/25 px-2 py-1.5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">{vh.lastCrawlLabel}</p>
                  <p className="text-md-sys-on-surface truncate mt-0.5" title={group.lastCrawl || sj.emDash}>
                    {group.lastCrawl || sj.emDash}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">{vh.lastAuditLabel}</p>
                  <p className="text-md-sys-on-surface truncate mt-0.5" title={group.lastAudit || sj.emDash}>
                    {group.lastAudit || sj.emDash}
                  </p>
                </div>
                {group.crawlDurationS != null ? (
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Timer className="h-3 w-3 text-md-sys-on-surface-variant shrink-0" aria-hidden />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">{vh.crawlDurationLabel}</p>
                      <p className="text-md-sys-on-surface tabular-nums mt-0.5">
                        {format(vh.crawlDurationValue, { seconds: group.crawlDurationS.toLocaleString() })}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {group.crawlOnly ? (
            <div className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/30 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant mb-1.5">{vh.crawlTrendsLabel}</p>
              {trends.hasCrawlTrendLines ? (
                <div className="flex gap-1.5">
                  <PortfolioTrendCell
                    label={vh.trendUrlsLabel}
                    values={trends.pagesTrend}
                    displayValue={group.urlCount.toLocaleString()}
                    mode="higher-better"
                  />
                  <PortfolioTrendCell
                    label={vh.trendTitleCoverageLabel}
                    helpKey="shared.titleCoverage"
                    values={trends.titleTrend}
                    displayValue={group.titleCoverage != null ? `${group.titleCoverage}%` : sj.emDash}
                    mode="higher-better"
                  />
                  <PortfolioTrendCell
                    label={vh.trendAvgWordsLabel}
                    values={trends.wordsTrend}
                    displayValue={group.avgWordCount != null ? group.avgWordCount.toLocaleString() : sj.emDash}
                    mode="higher-better"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-md-sys-on-surface-variant leading-snug">{vh.crawlTrendsNeedHistory}</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/30 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant mb-1.5">{vh.trendsLabel}</p>
              {trends.hasAuditTrendLines ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <PortfolioTrendCell
                    label={vh.trendHealthLabel}
                    helpKey="views.home.trendHealth"
                    values={trends.healthTrend}
                    displayValue={String(group.healthScore)}
                    mode="higher-better"
                  />
                  <PortfolioTrendCell
                    label={vh.trendIssuesLabel}
                    helpKey="views.home.trendIssues"
                    values={trends.issuesTrend}
                    displayValue={group.totalIssues.toLocaleString()}
                    mode="lower-better"
                  />
                  <PortfolioTrendCell
                    label={vh.perfScoreLabel}
                    helpKey="views.home.perfScore"
                    values={trends.perfTrend}
                    displayValue={group.perfScore != null ? String(group.perfScore) : sj.emDash}
                    mode="higher-better"
                  />
                  <PortfolioTrendCell
                    label={vh.seoScoreLabel}
                    helpKey="views.home.seoScore"
                    values={trends.seoTrend}
                    displayValue={group.seoScore != null ? String(group.seoScore) : sj.emDash}
                    mode="higher-better"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-md-sys-on-surface-variant leading-snug">{vh.trendsNeedHistory}</p>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={onOpen}
            className="press w-full rounded-full border border-md-sys-outline-variant/40 px-4 py-2 text-left hover:bg-md-sys-surface-container-low/60 active:scale-[0.99] transition-all disabled:opacity-60"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-md-sys-on-surface-variant">
                {group.crawlOnly ? format(vh.viewUrlsCta, { count: group.urlCount }) : vh.openBrandCta}
              </p>
              <div className="text-xs text-md-sys-primary-soft flex items-center gap-1 font-medium">
                <Globe className="h-3.5 w-3.5" />
                {group.crawlOnly ? format(vh.viewUrlsCta, { count: group.urlCount }) : vh.openBrandCta}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </button>
        </div>
      </Card>
    </div>
  );
}
