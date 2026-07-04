
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight, Copy, Globe2, Languages, Sparkles, Tag } from 'lucide-react';
import type { ReportPayload } from '@/types';
import { strings, format } from '@/lib/strings';
import HelpHint from '@/components/HelpHint';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import { CompactBarChart, CompactDonut } from '@/components/charts/compact';
import { buildKeywordsTabHref } from './overviewKeywordOpportunities';
import {
  OverviewTerminalPanel,
  OverviewTerminalActionLink,
  OverviewTerminalMetricTile,
  OverviewTerminalLogRow,
  type OverviewTerminalBand,
} from './OverviewTerminalPanel';
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

const vo = strings.views.overview;

const LOG_ROW_SEVERITY = [90, 65, 40];

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
    <div className="flex flex-col gap-3 rounded-lg border border-default/60 bg-brand-950/40 p-4 sm:flex-row sm:items-center">
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
  devData,
  children,
}: {
  title: string;
  viewAllHref: string;
  viewAllLabel: string;
  devData?: unknown;
  children: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-default bg-brand-900/40 ${
        devData != null ? 'relative group/dev-card' : ''
      }`}
    >
      {devData != null ? <DevCopyJsonButton data={devData} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-default bg-brand-950/30 px-4 py-2.5">
        <h3 className="whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        <Link to={viewAllHref} className="whitespace-nowrap text-xs font-medium text-link hover:underline">
          {viewAllLabel}
        </Link>
      </div>
      <div className="p-4">{children}</div>
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

  const showDuplicates = duplicateGroupCount > 0;
  const showLanguages = languagesDetected > 0;
  const languageOnly = showLanguages && !showDuplicates;

  const contentQualityHeaderDevData = useMemo(
    () => ({
      widget: 'overview.contentQuality.header',
      title: vo.contentIntelligence,
      subtitle: vo.contentQualitySubtitle,
      kpiParts,
      concerns,
      links: {
        contentOverviewHref,
        textAnalysisHref,
      },
      flags: {
        showDuplicates,
        showLanguages,
        mixedLanguage,
        showAdvancedInsights,
      },
    }),
    [
      concerns,
      contentOverviewHref,
      kpiParts,
      mixedLanguage,
      showAdvancedInsights,
      showDuplicates,
      showLanguages,
      textAnalysisHref,
      vo.contentIntelligence,
      vo.contentQualitySubtitle,
    ],
  );

  const contentQualityDuplicatesDevData = useMemo(
    () => ({
      widget: 'overview.contentQuality.duplicates',
      title: vo.duplicateGroups,
      duplicateGroupCount,
      duplicatePages,
      duplicateBand,
      topDuplicates,
      viewAllHref: contentOverviewHref,
      raw: {
        content_duplicates: data.content_duplicates,
      },
    }),
    [
      contentOverviewHref,
      data.content_duplicates,
      duplicateBand,
      duplicateGroupCount,
      duplicatePages,
      topDuplicates,
      vo.duplicateGroups,
    ],
  );

  const contentQualityLanguagesDevData = useMemo(
    () => ({
      widget: 'overview.contentQuality.languages',
      title: vo.languagesSampled,
      languagesDetected,
      mixedLanguage,
      dominantLanguage,
      languageShareRows,
      languageCounts,
      languageOnly,
      links: {
        textAnalysisHref,
        contentAnalyticsHref,
      },
      raw: {
        language_summary: data.language_summary,
      },
    }),
    [
      contentAnalyticsHref,
      data.language_summary,
      dominantLanguage,
      languageCounts,
      languageOnly,
      languageShareRows,
      languagesDetected,
      mixedLanguage,
      textAnalysisHref,
      vo.languagesSampled,
    ],
  );

  const contentQualityAdvancedDevData = useMemo(
    () => ({
      widget: 'overview.contentQuality.advancedInsights',
      semanticTopics,
      entityTotal,
      pagesWithNer,
      hasNer,
      links: {
        topicsHref,
        textAnalysisHref,
      },
      raw: {
        semantic_keyword_clusters: data.semantic_keyword_clusters,
        ner_site_summary: data.ner_site_summary,
      },
    }),
    [
      data.ner_site_summary,
      data.semantic_keyword_clusters,
      entityTotal,
      hasNer,
      pagesWithNer,
      semanticTopics,
      textAnalysisHref,
      topicsHref,
    ],
  );

  if (!shouldShowContentQuality(data)) return null;

  const duplicateTileBand: OverviewTerminalBand = duplicateGroupCount > 0 ? duplicateGroupsBand(duplicateGroupCount) : 'good';
  const languageTileBand: OverviewTerminalBand = mixedLanguage ? 'fair' : 'good';

  return (
    <OverviewTerminalPanel
      className="mb-8"
      icon={<Sparkles className="h-4 w-4" aria-hidden />}
      title={vo.contentIntelligence}
      subtitle={vo.contentQualitySubtitle}
      liveLabel={vo.diagnosticPanelLive}
      actions={
        <>
          <HelpHint ariaLabel={vo.contentQualityHelpTitle} side="bottom">
            {vo.contentQualityHelpBody}
          </HelpHint>
          {duplicateGroupCount > 0 ? (
            <OverviewTerminalActionLink to={contentOverviewHref} icon={<Copy className="h-3.5 w-3.5" />} primary>
              {vo.contentQualityReviewDuplicates}
            </OverviewTerminalActionLink>
          ) : null}
          <OverviewTerminalActionLink to={textAnalysisHref} icon={<Languages className="h-3.5 w-3.5" />}>
            {vo.contentQualityOpenTextAnalysis}
          </OverviewTerminalActionLink>
        </>
      }
    >
      <div className="relative group/dev-card">
        <DevCopyJsonButton data={contentQualityHeaderDevData} />

        {showDuplicates || showLanguages ? (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {showDuplicates ? (
              <OverviewTerminalMetricTile
                href={contentOverviewHref}
                icon={<Copy className="h-5 w-5" aria-hidden />}
                label={vo.contentQualityGroupsCount}
                value={duplicateGroupCount.toLocaleString()}
                sub={format(vo.contentQualityDuplicatePages, { pages: duplicatePages.toLocaleString() })}
                band={duplicateTileBand}
              />
            ) : null}
            {showLanguages ? (
              <OverviewTerminalMetricTile
                href={textAnalysisHref}
                icon={<Globe2 className="h-5 w-5" aria-hidden />}
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
                band={languageTileBand}
              />
            ) : null}
          </div>
        ) : null}

        <div className="mb-5 overflow-hidden rounded-lg border border-default bg-brand-900/40">
          <div className="border-b border-default bg-brand-950/30 px-4 py-2">
            <h3 className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Activity
                className={`h-3.5 w-3.5 ${concerns.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`}
                aria-hidden
              />
              {vo.diagnosticLog}
            </h3>
          </div>
          <div className="space-y-1 p-2">
            {concerns.length === 0 ? (
              <p className="p-4 text-center font-mono text-xs text-muted-foreground">{vo.noActiveAnomalies}</p>
            ) : (
              concerns.map((concern, i) => (
                <OverviewTerminalLogRow
                  key={concern.id}
                  href={concern.href}
                  label={concern.label}
                  severityLabel={vo.diagnosticPanelSeverity}
                  severityScore={LOG_ROW_SEVERITY[i] ?? 40}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 items-start gap-4 ${showDuplicates && showLanguages ? 'lg:grid-cols-2' : ''}`}>
        {showDuplicates ? (
          <ContentQualityColumn
            title={vo.duplicateGroups}
            viewAllHref={contentOverviewHref}
            viewAllLabel={vo.contentQualityReviewDuplicates}
            devData={contentQualityDuplicatesDevData}
          >
            <div>
              <h4 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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
                        className="group flex items-center gap-3 rounded-lg border border-default/60 bg-brand-950/40 px-3 py-2.5 transition-colors hover:border-blue-500/30 hover:bg-brand-900/60"
                      >
                        <span className="pt-0.5 font-mono text-xs text-muted-foreground">{'>_'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground" title={cluster.representative_url}>
                            {label}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
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
          <ContentQualityColumn
            title={vo.languagesSampled}
            viewAllHref={contentAnalyticsHref}
            viewAllLabel={vo.contentQualityOpenContentAnalytics}
            devData={contentQualityLanguagesDevData}
          >
            <div>
              {mixedLanguage ? (
                <p className="mb-3 text-xs text-amber-800 dark:text-amber-200/90">
                  {vo.contentQualityMixedLanguageHint}
                </p>
              ) : null}
              <LanguageMixVisualization counts={languageCounts} singleLanguage={languagesDetected === 1} />
            </div>
          </ContentQualityColumn>
        ) : null}
      </div>

      {showAdvancedInsights ? (
        <div className="relative group/dev-card mt-5 border-t border-default pt-4">
          <DevCopyJsonButton data={contentQualityAdvancedDevData} />
          <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {vo.contentQualityAdvancedInsights}
          </p>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
            {semanticTopics > 0 ? (
              <OverviewTerminalMetricTile
                href={topicsHref}
                icon={<Tag className="h-5 w-5" aria-hidden />}
                label={vo.parentTopics}
                value={semanticTopics.toLocaleString()}
                sub={vo.semanticGroups}
                band="good"
              />
            ) : null}
            {hasNer ? (
              <OverviewTerminalMetricTile
                href={textAnalysisHref}
                icon={<Sparkles className="h-5 w-5" aria-hidden />}
                label={vo.namedEntities}
                value={entityTotal.toLocaleString()}
                sub={pagesWithNer > 0 ? format(vo.pagesSampled, { n: pagesWithNer }) : vo.entitiesSitewide}
                band="neutral"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </OverviewTerminalPanel>
  );
}
