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
import { Card } from '@/components';
import Sparkline, { type SparklineMode } from '@/components/Sparkline';
import { DataSourceBadgeRow } from '@/components/DataSourceBadge';
import { PRIORITY_CONFIG } from '@/lib/issuePriority';
import { format, strings } from '@/lib/strings';
import {
  formatPortfolioCrawlSummary,
  hasPortfolioCrawlConfig,
} from '@/lib/portfolioCrawlConfig';
import type { PortfolioAuditHistoryPoint } from '@/lib/portfolioAuditHistory';
import type { PortfolioCrawlHistoryPoint } from '@/types/api';
import type { PortfolioCategorySnapshot, PortfolioGroup } from '@/types';
import {
  derivePortfolioCardTrends,
  healthScoreClass,
  shortCategoryLabel,
} from '@/components/portfolio/portfolioCardUtils';

export interface PortfolioPropertyCardProps {
  group: PortfolioGroup;
  cardKey: string;
  auditHistory: PortfolioAuditHistoryPoint[];
  crawlHistory: PortfolioCrawlHistoryPoint[];
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
  values,
  displayValue,
  mode,
}: {
  label: string;
  values: number[];
  displayValue: string;
  mode: SparklineMode;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-md border border-default/60 bg-brand-900/25 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <div className="flex items-end justify-between gap-1 mt-1 min-h-[22px]">
        <Sparkline values={values} mode={mode} width={92} height={22} />
        <span className="text-sm font-semibold tabular-nums text-foreground shrink-0 leading-none pb-0.5">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

function PortfolioCategoryChip({ cat, issueLabel }: { cat: PortfolioCategorySnapshot; issueLabel: string }) {
  return (
    <div className="rounded-md border border-default/70 bg-brand-900/30 px-1.5 py-1 text-center min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground truncate" title={cat.name}>
        {shortCategoryLabel(cat)}
      </p>
      <p className={`text-sm font-bold tabular-nums leading-tight ${healthScoreClass(cat.score)}`}>{cat.score}</p>
      {cat.issueCount > 0 ? (
        <p className="text-[9px] text-muted-foreground tabular-nums truncate">
          {format(issueLabel, { count: cat.issueCount })}
        </p>
      ) : null}
    </div>
  );
}

function PortfolioSignalPill({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] tabular-nums text-amber-800 dark:text-amber-300">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value.toLocaleString()}</span>
    </span>
  );
}

export default function PortfolioPropertyCard({
  group,
  cardKey,
  auditHistory,
  crawlHistory,
  confirmOpen,
  isDeleting,
  isOpening,
  onOpen,
  onDeleteToggle,
  onDeleteCancel,
  onDeleteConfirm,
}: PortfolioPropertyCardProps) {
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
    <div className="relative min-w-[520px] max-w-[600px] shrink-0 text-left">
      <Card
        shadow
        padding="none"
        className="group border-default/90 hover:border-blue-500/45 transition-all duration-200 h-full p-2"
      >
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onOpen}
              className="min-w-0 flex-1 flex items-start justify-between gap-3 text-left rounded-md -m-1 p-1 hover:bg-brand-900/40 transition-colors disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  {vh.brandLabel}
                </p>
                <h3 className="text-sm sm:text-[15px] font-semibold text-foreground truncate">{group.domainName}</h3>
                {group.crawlOnly ? (
                  <span className="mt-0.5 inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    {vh.crawlOnlyBadge}
                  </span>
                ) : null}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group.crawlOnly ? vh.titleCoverageLabel : vh.healthScoreLabel}
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  {group.crawlOnly && trends.titleTrend.length >= 1 ? (
                    <Sparkline values={trends.titleTrend} mode="higher-better" width={72} height={20} />
                  ) : null}
                  {!group.crawlOnly && trends.healthTrend.length >= 1 ? (
                    <Sparkline values={trends.healthTrend} mode="higher-better" width={72} height={20} />
                  ) : null}
                  <p className={`text-base font-bold tabular-nums ${healthScoreClass(group.healthScore)}`}>
                    {group.healthScore}
                  </p>
                </div>
                {!group.crawlOnly && trends.healthDelta != null && trends.healthDelta !== 0 ? (
                  <p
                    className={`text-[10px] tabular-nums mt-0.5 ${trends.healthDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                  >
                    {trends.healthDelta > 0
                      ? format(vh.healthDeltaUp, { delta: trends.healthDelta })
                      : format(vh.healthDeltaDown, { delta: trends.healthDelta })}
                  </p>
                ) : null}
                {!group.crawlOnly && auditHistory.length > 0 ? (
                  <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
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
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-red-700 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {confirmOpen ? (
            <div
              className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 space-y-2"
              role="alertdialog"
              aria-labelledby={`delete-title-${cardKey}`}
            >
              <p id={`delete-title-${cardKey}`} className="text-xs font-medium text-foreground">
                {vh.deleteConfirmTitle}
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
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
                  className="px-2 py-1 text-[11px] rounded-md border border-default text-muted-foreground hover:text-foreground"
                  onClick={onDeleteCancel}
                >
                  {vh.deleteCancel}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  className="px-2 py-1 text-[11px] rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                  onClick={onDeleteConfirm}
                >
                  {isDeleting ? vh.deleting : vh.deleteConfirm}
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-default bg-brand-900/35 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{vh.crawlUrlLabel}</p>
            <a
              href={group.crawlUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex max-w-full items-center gap-1 text-xs sm:text-sm text-link hover:underline"
              title={group.crawlUrl}
            >
              <span className="truncate font-mono">{group.crawlUrl}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </a>
          </div>

          {showCrawlConfig || showDataSources ? (
            <div className="rounded-md border border-default bg-brand-900/35 px-2 py-1.5 space-y-1.5">
              {showCrawlConfig ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    {vh.crawlConfigLabel}
                  </p>
                  <p className="text-xs text-foreground leading-snug">{crawlConfigSegments.join(' · ')}</p>
                </div>
              ) : null}
              {showDataSources ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {strings.views.overview.dataSourcesLabel}
                  </p>
                  <DataSourceBadgeRow sources={group.dataSources!} />
                </div>
              ) : null}
            </div>
          ) : null}

          {group.crawlOnly ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-brand-900/35 px-2 py-1.5 border border-default space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.urlCountLabel}</p>
                    <p className="text-lg leading-none font-semibold text-bright tabular-nums mt-1">
                      {group.urlCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.titleCoverageLabel}</p>
                    <p className="text-lg leading-none font-semibold text-foreground tabular-nums mt-1">
                      {group.titleCoverage != null ? `${group.titleCoverage}%` : sj.emDash}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-foreground truncate border-t border-default/60 pt-2" title={group.lastCrawl || sj.emDash}>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.lastCrawlLabel}: </span>
                  {group.lastCrawl || sj.emDash}
                </p>
              </div>
              <div className="rounded-md bg-brand-900/35 px-2 py-1.5 border border-default space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.avgWordCountLabel}</p>
                    <p className="text-lg leading-none font-semibold text-bright tabular-nums mt-1">
                      {group.avgWordCount != null ? group.avgWordCount.toLocaleString() : sj.emDash}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.thinPagesLabel}</p>
                    <p className="text-lg leading-none font-semibold text-foreground tabular-nums mt-1">
                      {group.thinPages != null ? group.thinPages.toLocaleString() : sj.emDash}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug border-t border-default/60 pt-2">
                  {vh.crawlOnlyHint}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {group.categorySnapshots.length > 0 ? (
                <div className="rounded-md border border-default bg-brand-900/30 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{vh.categoryScoresLabel}</p>
                  <div className="grid grid-cols-4 gap-1">
                    {group.categorySnapshots.map((cat) => (
                      <PortfolioCategoryChip key={cat.id} cat={cat} issueLabel={vh.categoryIssueCount} />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-brand-900/35 px-2 py-1.5 border border-default">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.urlCountLabel}</p>
                  <p className="text-lg font-semibold text-bright tabular-nums mt-1">{group.urlCount.toLocaleString()}</p>
                  {group.medianWordCount != null ? (
                    <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                      {vh.medianWordsLabel}: {group.medianWordCount.toLocaleString()}
                    </p>
                  ) : null}
                  {group.medianResponseMs != null ? (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {format(vh.responseTimeValue, { ms: group.medianResponseMs.toLocaleString() })}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-md bg-brand-900/35 px-2 py-1.5 border border-default">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {vh.totalIssuesLabel}
                  </p>
                  <p className="text-lg font-semibold text-bright tabular-nums mt-1">{group.totalIssues.toLocaleString()}</p>
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
                <div className="rounded-md bg-brand-900/35 px-2 py-1.5 border border-default">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Gauge className="h-3 w-3" aria-hidden />
                    Lighthouse
                  </p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-sm font-semibold tabular-nums">
                      <span className="text-[10px] text-muted-foreground uppercase mr-1">{vh.perfScoreLabel}</span>
                      {group.perfScore ?? sj.emDash}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      <span className="text-[10px] text-muted-foreground uppercase mr-1">{vh.seoScoreLabel}</span>
                      {group.seoScore ?? sj.emDash}
                    </p>
                  </div>
                  {trends.urgentCount > 0 ? (
                    <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                      {vh.trendUrgentLabel}: {trends.urgentCount}
                    </p>
                  ) : null}
                </div>
              </div>

              {(trends.seoSignalItems.length > 0 || group.securityFindings > 0 || group.duplicateClusters > 0) ? (
                <div className="rounded-md border border-default bg-brand-900/30 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{vh.seoSignalsLabel}</p>
                  <div className="flex flex-wrap gap-1">
                    {trends.seoSignalItems.map((row) => (
                      <PortfolioSignalPill key={row.label} label={row.label} value={row.value} />
                    ))}
                    <PortfolioSignalPill label={vh.securityFindingsLabel} value={group.securityFindings} />
                    <PortfolioSignalPill label={vh.duplicateContentLabel} value={group.duplicateClusters} />
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border border-default bg-brand-900/25 px-2 py-1.5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.lastCrawlLabel}</p>
                  <p className="text-foreground truncate mt-0.5" title={group.lastCrawl || sj.emDash}>
                    {group.lastCrawl || sj.emDash}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.lastAuditLabel}</p>
                  <p className="text-foreground truncate mt-0.5" title={group.lastAudit || sj.emDash}>
                    {group.lastAudit || sj.emDash}
                  </p>
                </div>
                {group.crawlDurationS != null ? (
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Timer className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vh.crawlDurationLabel}</p>
                      <p className="text-foreground tabular-nums mt-0.5">
                        {format(vh.crawlDurationValue, { seconds: group.crawlDurationS.toLocaleString() })}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {group.crawlOnly ? (
            <div className="rounded-md border border-default bg-brand-900/30 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{vh.crawlTrendsLabel}</p>
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
                <p className="text-[11px] text-muted-foreground leading-snug">{vh.crawlTrendsNeedHistory}</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-default bg-brand-900/30 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{vh.trendsLabel}</p>
              {trends.hasAuditTrendLines ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <PortfolioTrendCell
                    label={vh.trendHealthLabel}
                    values={trends.healthTrend}
                    displayValue={String(group.healthScore)}
                    mode="higher-better"
                  />
                  <PortfolioTrendCell
                    label={vh.trendIssuesLabel}
                    values={trends.issuesTrend}
                    displayValue={group.totalIssues.toLocaleString()}
                    mode="lower-better"
                  />
                  <PortfolioTrendCell
                    label={vh.perfScoreLabel}
                    values={trends.perfTrend}
                    displayValue={group.perfScore != null ? String(group.perfScore) : sj.emDash}
                    mode="higher-better"
                  />
                  <PortfolioTrendCell
                    label={vh.seoScoreLabel}
                    values={trends.seoTrend}
                    displayValue={group.seoScore != null ? String(group.seoScore) : sj.emDash}
                    mode="higher-better"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-snug">{vh.trendsNeedHistory}</p>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={onOpen}
            className="w-full rounded-md border border-default px-2 py-1.5 text-left hover:bg-brand-900/40 transition-colors disabled:opacity-60"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {group.crawlOnly ? format(vh.viewUrlsCta, { count: group.urlCount }) : vh.openBrandCta}
              </p>
              <div className="text-xs text-link-soft flex items-center gap-1 font-medium">
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
