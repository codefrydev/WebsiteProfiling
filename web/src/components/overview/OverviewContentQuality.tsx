
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  Globe2,
  Languages,
  Sparkles,
  Tag,
} from 'lucide-react';
import type { ReportPayload } from '@/types';
import { strings, format } from '@/lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import HelpHint from '@/components/HelpHint';
import { Card, StatCard } from '@/components';
import { CompactBarChart, CompactDonut } from '@/components/charts/compact';
import { buildKeywordsTabHref } from './overviewKeywordOpportunities';
import {
  buildLanguageBarChartData,
  buildLanguageMixSegments,
  buildViewHref,
  duplicateGroupsBand,
  duplicateMemberCount,
  languageCount,
  languageShares,
  selectContentConcerns,
  selectTopDuplicateClusters,
  shouldShowContentQuality,
  stripUrlForDisplay,
  totalDuplicateMemberPages,
} from './contentQualityMetrics';
import { bandClassName, metricBandLabel } from './crawlSnapshotMetrics';

const vo = strings.views.overview;

export interface OverviewContentQualityProps {
  data: ReportPayload;
  querySuffix: string;
  keywordsHref: string;
}

function LanguageMixVisualization({
  counts,
  singleLanguage,
}: {
  counts: Record<string, number>;
  singleLanguage: boolean;
}) {
  const barChart = useMemo(() => buildLanguageBarChartData(counts), [counts]);
  const donutSegments = useMemo(() => buildLanguageMixSegments(counts), [counts]);
  const primaryShare = useMemo(() => languageShares(counts, 1)[0], [counts]);

  if (barChart) {
    return (
      <CompactBarChart
        variant="chubby"
        heights={barChart.map((row) => row.height)}
        labels={barChart.map((row) => row.label)}
        colors={barChart.map((row) => row.color)}
      />
    );
  }

  if (donutSegments.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-default/50 bg-brand-950/35 p-4 sm:flex-row sm:items-center">
      <CompactDonut
        segments={donutSegments}
        centerValue={primaryShare ? `${primaryShare.pct}%` : undefined}
        centerLabel={primaryShare?.lang}
        showCounts
        ringClassName="h-16 w-16"
      />
      {singleLanguage ? (
        <p className="text-sm text-muted-foreground">{vo.contentQualitySingleLanguageSite}</p>
      ) : null}
    </div>
  );
}

function ContentQualityColumn({
  title,
  viewAllHref,
  viewAllLabel,
  statCard,
  children,
}: {
  title: string;
  viewAllHref: string;
  viewAllLabel: string;
  statCard: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-default/80 bg-brand-900/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-bright">{title}</h3>
        <Link to={viewAllHref} className="text-xs font-medium text-link hover:underline">
          {viewAllLabel}
        </Link>
      </div>
      {statCard}
      {children}
    </div>
  );
}

export function OverviewContentQuality({ data, querySuffix, keywordsHref }: OverviewContentQualityProps) {
  const {
    duplicateGroupCount,
    duplicatePages,
    topDuplicates,
    languageCounts,
    languagesDetected,
    mixedLanguage,
    duplicateBand,
    languageShareRows,
    dominantLanguage,
    kpiParts,
    concerns,
    showAdvancedInsights,
    semanticTopics,
    hasNer,
    entityTotal,
    pagesWithNer,
    contentOverviewHref,
    textAnalysisHref,
    contentAnalyticsHref,
    topicsHref,
  } = useMemo(() => {
    const dupeGroups = data.content_duplicates || [];
    const dupeCount = dupeGroups.length;
    const dupePages = totalDuplicateMemberPages(dupeGroups);
    const langCounts = data.language_summary?.counts || {};
    const langDetected = languageCount(langCounts);
    const mixed = Boolean(data.language_summary?.mixed_site);
    const semanticTopics = data.semantic_keyword_clusters?.length ?? 0;
    const entityTotal = data.ner_site_summary?.total_entities ?? 0;
    const pagesWithNer = data.ner_site_summary?.pages_with_ner ?? 0;
    const contentHref = buildViewHref('content', querySuffix, { tab: 'overview' });
    const textHref = buildViewHref('text-content-analysis', querySuffix);
    const analyticsHref = buildViewHref('content-analytics', querySuffix);
    const shareRows = languageShares(langCounts, 1);
    const parts: string[] = [];
    if (dupeCount > 0) parts.push(format(vo.contentQualityKpiDuplicates, { groups: dupeCount.toLocaleString() }));
    if (langDetected > 0) parts.push(format(vo.contentQualityKpiLanguages, { count: langDetected.toLocaleString() }));
    if (mixed) parts.push(vo.contentQualityKpiMixedLanguage);
    return {
      duplicateGroupCount: dupeCount,
      duplicatePages: dupePages,
      topDuplicates: selectTopDuplicateClusters(dupeGroups, 2),
      languageCounts: langCounts,
      languagesDetected: langDetected,
      mixedLanguage: mixed,
      duplicateBand: duplicateGroupsBand(dupeCount),
      languageShareRows: shareRows,
      dominantLanguage: shareRows[0],
      kpiParts: parts,
      concerns: selectContentConcerns({
        duplicateGroups: dupeCount,
        duplicatePages: dupePages,
        mixedLanguage: mixed,
        languageCount: langDetected,
        contentHref,
        textAnalysisHref: textHref,
        formatDuplicateGroups: (groups, pages) => format(vo.contentConcernDuplicates, { groups, pages }),
        formatMixedLanguage: (languages) => format(vo.contentConcernMixedLanguage, { languages }),
      }),
      showAdvancedInsights: semanticTopics > 0 || entityTotal > 0 || pagesWithNer > 0,
      semanticTopics,
      hasNer: entityTotal > 0 || pagesWithNer > 0,
      entityTotal,
      pagesWithNer,
      contentOverviewHref: contentHref,
      textAnalysisHref: textHref,
      contentAnalyticsHref: analyticsHref,
      topicsHref: buildKeywordsTabHref(keywordsHref, 'topics'),
    };
  }, [data, querySuffix, keywordsHref]);

  if (!shouldShowContentQuality(data)) return null;

  const showDuplicates = duplicateGroupCount > 0;
  const showLanguages = languagesDetected > 0;
  const languageOnly = showLanguages && !showDuplicates;

  return (
    <Card shadow overflowHidden className="mb-8">
      <div className="border-b border-muted/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
              <h2 className="text-lg font-bold text-bright">{vo.contentIntelligence}</h2>
              <HelpHint ariaLabel={vo.contentQualityHelpTitle} side="bottom">
                {vo.contentQualityHelpBody}
              </HelpHint>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{vo.contentQualitySubtitle}</p>
            {kpiParts.length > 0 ? (
              <p className="mt-2 text-sm font-medium text-foreground">{kpiParts.join(' · ')}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {duplicateGroupCount > 0 ? (
              <Link
                to={contentOverviewHref}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                <Copy className="h-4 w-4" />
                {vo.contentQualityReviewDuplicates}
              </Link>
            ) : null}
            <Link
              to={textAnalysisHref}
              className="inline-flex items-center gap-2 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-700/50"
            >
              <Languages className="h-4 w-4" />
              {vo.contentQualityOpenTextAnalysis}
            </Link>
          </div>
        </div>

        {concerns.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {vo.contentQualityTopConcerns}
            </p>
            <div className="flex flex-wrap gap-2">
              {concerns.map((concern) => (
                <Link
                  key={concern.id}
                  to={concern.href}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-amber-500/40 hover:bg-amber-500/15"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                  <span className="truncate">{concern.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`grid grid-cols-1 items-start gap-4 p-4 sm:p-5 ${showDuplicates && showLanguages ? 'lg:grid-cols-2' : ''}`}
      >
        {showDuplicates ? (
          <ContentQualityColumn
            title={vo.duplicateGroups}
            viewAllHref={contentOverviewHref}
            viewAllLabel={vo.contentQualityReviewDuplicates}
            statCard={
              <StatCard
                shadow
                href={contentOverviewHref}
                icon={<Copy className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />}
                label={vo.contentQualityGroupsCount}
                value={duplicateGroupCount.toLocaleString()}
                sub={format(vo.contentQualityDuplicatePages, { pages: duplicatePages.toLocaleString() })}
                band={metricBandLabel(duplicateBand, vo)}
                bandClassName={bandClassName(duplicateBand)}
                valueClassName={bandClassName(duplicateBand)}
                className={
                  duplicateBand === 'critical'
                    ? 'border-amber-500/25 ring-1 ring-inset ring-amber-500/15'
                    : 'border-default'
                }
                hint={metricHelpHint('views.content.duplicateCluster')}
              />
            }
          >
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {vo.contentQualityLargestClusters}
              </h4>
              <ul className="space-y-2">
                {topDuplicates.map((cluster) => {
                  const members = duplicateMemberCount(cluster);
                  const label = stripUrlForDisplay(cluster.representative_url || cluster.id);
                  return (
                    <li key={cluster.id}>
                      <Link
                        to={contentOverviewHref}
                        className="group flex items-center gap-3 rounded-lg border border-default/60 bg-brand-900/40 px-3 py-2.5 transition-colors hover:border-blue-500/30 hover:bg-brand-900/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground" title={cluster.representative_url}>
                            {label}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {format(vo.contentQualityClusterMembers, { count: members.toLocaleString() })}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </ContentQualityColumn>
        ) : null}

        {showLanguages ? (
          languageOnly ? (
            <div className="rounded-xl border border-default/80 bg-brand-900/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-bright">{vo.languagesSampled}</h3>
                <Link to={textAnalysisHref} className="text-xs font-medium text-link hover:underline">
                  {vo.contentQualityOpenTextAnalysis}
                </Link>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(11rem,14rem)_1fr] sm:items-start">
                <StatCard
                  shadow
                  href={textAnalysisHref}
                  icon={<Globe2 className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden />}
                  label={vo.contentQualityLocaleCount}
                  value={languagesDetected.toLocaleString()}
                  sub={
                    dominantLanguage
                      ? format(vo.contentQualityDominantLanguage, {
                          lang: dominantLanguage.lang,
                          pct: dominantLanguage.pct,
                        })
                      : undefined
                  }
                  band={mixedLanguage ? vo.mixedLanguage : vo.metricBandGood}
                  bandClassName={mixedLanguage ? bandClassName('fair') : bandClassName('good')}
                  className={
                    mixedLanguage ? 'border-amber-500/20 ring-1 ring-inset ring-amber-500/10' : 'border-cyan-500/15'
                  }
                  hint={metricHelpHint('views.overview.contentQualityLocales')}
                />
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {vo.contentQualityLanguageMix}
                    </h4>
                    <Link to={contentAnalyticsHref} className="text-xs font-medium text-link hover:underline">
                      {vo.contentQualityOpenContentAnalytics}
                    </Link>
                  </div>
                  {mixedLanguage ? (
                    <p className="mb-3 text-xs text-amber-800 dark:text-amber-200/90">
                      {vo.contentQualityMixedLanguageHint}
                    </p>
                  ) : null}
                  <LanguageMixVisualization counts={languageCounts} singleLanguage={languagesDetected === 1} />
                </div>
              </div>
            </div>
          ) : (
            <ContentQualityColumn
              title={vo.languagesSampled}
              viewAllHref={textAnalysisHref}
              viewAllLabel={vo.contentQualityOpenTextAnalysis}
              statCard={
                <StatCard
                  shadow
                  href={textAnalysisHref}
                  icon={<Globe2 className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden />}
                  label={vo.contentQualityLocaleCount}
                  value={languagesDetected.toLocaleString()}
                  sub={
                    dominantLanguage
                      ? format(vo.contentQualityDominantLanguage, {
                          lang: dominantLanguage.lang,
                          pct: dominantLanguage.pct,
                        })
                      : undefined
                  }
                  band={mixedLanguage ? vo.mixedLanguage : vo.metricBandGood}
                  bandClassName={mixedLanguage ? bandClassName('fair') : bandClassName('good')}
                  className={
                    mixedLanguage ? 'border-amber-500/20 ring-1 ring-inset ring-amber-500/10' : 'border-cyan-500/15'
                  }
                  hint={metricHelpHint('views.overview.contentQualityLocales')}
                />
              }
            >
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {vo.contentQualityLanguageMix}
                  </h4>
                  <Link to={contentAnalyticsHref} className="text-xs font-medium text-link hover:underline">
                    {vo.contentQualityOpenContentAnalytics}
                  </Link>
                </div>
                {mixedLanguage ? (
                  <p className="mb-3 text-xs text-amber-800 dark:text-amber-200/90">
                    {vo.contentQualityMixedLanguageHint}
                  </p>
                ) : null}
                <LanguageMixVisualization counts={languageCounts} singleLanguage={languagesDetected === 1} />
              </div>
            </ContentQualityColumn>
          )
        ) : null}
      </div>

      {showAdvancedInsights ? (
        <div className="border-t border-muted/60 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {vo.contentQualityAdvancedInsights}
          </p>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {semanticTopics > 0 ? (
              <StatCard
                shadow
                href={topicsHref}
                icon={<Tag className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                label={vo.parentTopics}
                value={semanticTopics.toLocaleString()}
                sub={vo.semanticGroups}
              />
            ) : null}
            {hasNer ? (
              <StatCard
                shadow
                href={textAnalysisHref}
                icon={<Sparkles className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden />}
                label={vo.namedEntities}
                value={entityTotal.toLocaleString()}
                sub={
                  pagesWithNer > 0
                    ? format(vo.pagesSampled, { n: pagesWithNer })
                    : vo.entitiesSitewide
                }
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
