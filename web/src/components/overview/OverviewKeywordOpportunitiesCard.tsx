
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Compass,
  Lightbulb,
  MousePointerClick,
  Settings2,
  ShoppingCart,
  Tag,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { KeywordRow } from '@/types/components';
import type { ContentAnalyticsData, KeywordOpportunities, KeywordReportData } from '@/types/report';
import { strings, format } from '@/lib/strings';
import { viewIdToPathSlug } from '@/routes';
import { dispatchOpenIntegrations } from '@/lib/pipelineJobEvents';
import { Card } from '@/components';
import { OverviewStatChip } from './OverviewStatChip';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import HelpHint from '@/components/HelpHint';
import { isJunkSemanticTerm } from '@/lib/semanticTextHygiene';
import {
  KEYWORD_PREVIEW_LIMIT,
  buildKeywordsTabHref,
  formatCrawlActionLabel,
  formatCrawlPagesSuffix,
  formatGscOpportunitySuffix,
  formatGscQuickWinSuffix,
  selectCrawlHighEmphasis,
  selectCrawlQuickWins,
  selectGscOpportunities,
  selectGscQuickWins,
  selectSiteTopKeywords,
  selectTopTopicClusters,
  sumGscQuickWinClicks,
} from './overviewKeywordOpportunities';

interface OverviewKeywordOpportunitiesCardProps {
  keywords?: KeywordReportData;
  keywordOpportunities?: KeywordOpportunities;
  contentAnalytics?: ContentAnalyticsData;
  keywordsHref: string;
  hasGoogleConnected: boolean;
}

function intentIcon(intent?: string) {
  switch (intent) {
    case 'informational':
      return <BookOpen className="h-3.5 w-3.5 text-blue-500" aria-hidden />;
    case 'navigational':
      return <Compass className="h-3.5 w-3.5 text-purple-500" aria-hidden />;
    case 'commercial':
      return <ShoppingCart className="h-3.5 w-3.5 text-amber-500" aria-hidden />;
    case 'transactional':
      return <Target className="h-3.5 w-3.5 text-emerald-500" aria-hidden />;
    default:
      return <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
  }
}

function KeywordPreviewRow({
  href,
  keyword,
  suffix,
  metricClassName = 'text-muted-foreground',
  icon,
}: {
  href: string;
  keyword: string;
  suffix: string;
  metricClassName?: string;
  icon?: ReactNode;
}) {
  return (
    <li>
      <Link
        to={href}
        className="group flex items-center gap-2 rounded-lg border border-default/60 bg-brand-900/30 px-3 py-2.5 transition-colors hover:border-blue-500/30 hover:bg-brand-900/50"
      >
        {icon ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-900/60">
            {icon}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="min-w-0 max-w-full truncate text-sm font-medium text-foreground" title={keyword}>
            {keyword}
          </span>
          {suffix ? (
            <span className={`text-xs tabular-nums ${metricClassName}`}>{suffix}</span>
          ) : null}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link" />
      </Link>
    </li>
  );
}

function PreviewColumn({
  title,
  icon: Icon,
  iconClassName,
  viewAllHref,
  viewAllLabel,
  devData,
  children,
}: {
  title: string;
  icon: typeof Zap;
  iconClassName: string;
  viewAllHref: string;
  viewAllLabel: string;
  devData?: unknown;
  children: ReactNode;
}) {
  return (
    <Card padding="tight" devData={devData} className="border border-default/80 bg-brand-900/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Icon className={`h-4 w-4 shrink-0 ${iconClassName}`} aria-hidden />
          {title}
        </h3>
        <Link to={viewAllHref} className="text-xs font-medium text-link hover:underline">
          {viewAllLabel}
        </Link>
      </div>
      {children}
    </Card>
  );
}

export function OverviewKeywordOpportunitiesCard({
  keywords,
  keywordOpportunities,
  contentAnalytics,
  keywordsHref,
  hasGoogleConnected,
}: OverviewKeywordOpportunitiesCardProps) {
  const vo = strings.views.overview;
  const ke = strings.views.keywordsExplorer;
  const sj = strings.common;

  const kwRows: KeywordRow[] = Array.isArray(keywords?.rows) ? keywords.rows : [];
  const gscKeywordCount = keywords?.gsc_keyword_count ?? 0;
  const hasGscEnrichment = gscKeywordCount > 0;

  const gscQuickWinsAll = selectGscQuickWins(kwRows, 200);
  const gscOpportunitiesAll = selectGscOpportunities(kwRows, 200);
  const gscQuickWins = gscQuickWinsAll.slice(0, KEYWORD_PREVIEW_LIMIT);
  const gscOpportunities = gscOpportunitiesAll.slice(0, KEYWORD_PREVIEW_LIMIT);
  const crawlQuickWinsAll = selectCrawlQuickWins(keywordOpportunities?.quick_wins, 200);
  const crawlHighValueAll = selectCrawlHighEmphasis(keywordOpportunities?.high_value, 200);
  const crawlQuickWins = crawlQuickWinsAll.slice(0, KEYWORD_PREVIEW_LIMIT);
  const crawlHighValue = crawlHighValueAll.slice(0, KEYWORD_PREVIEW_LIMIT);
  const topicClusters = selectTopTopicClusters(keywordOpportunities?.token_topic_clusters, 6);
  const siteTopTermsAll = selectSiteTopKeywords(contentAnalytics?.top_keywords_site, 200);
  const siteTopTerms = siteTopTermsAll.slice(0, KEYWORD_PREVIEW_LIMIT);

  const useGscMode = hasGscEnrichment && (gscQuickWinsAll.length > 0 || gscOpportunitiesAll.length > 0);
  const showCrawlColumns = !useGscMode && (crawlQuickWinsAll.length > 0 || crawlHighValueAll.length > 0);
  const showSiteTerms = !useGscMode && !showCrawlColumns && siteTopTermsAll.length > 0;
  const showCard = useGscMode || showCrawlColumns || showSiteTerms || topicClusters.length > 0;

  const quickWinsHref = buildKeywordsTabHref(keywordsHref, 'quickwins');
  const opportunitiesHref = buildKeywordsTabHref(keywordsHref, 'opportunities');
  const topicsHref = buildKeywordsTabHref(keywordsHref, 'topics');
  const keywordRowHref = (tab: string) => buildKeywordsTabHref(keywordsHref, tab);

  const kpiLine = useGscMode
    ? format(vo.keywordOpportunitiesKpiGsc, {
        quickWins: gscQuickWinsAll.length.toLocaleString(),
        clicks: sumGscQuickWinClicks(kwRows).toLocaleString(),
        expansion: gscOpportunitiesAll.length.toLocaleString(),
      })
    : showCrawlColumns
      ? format(vo.keywordOpportunitiesKpiCrawl, {
          actions: crawlQuickWinsAll.length.toLocaleString(),
          emphasis: crawlHighValueAll.length.toLocaleString(),
        })
      : showSiteTerms
        ? format(vo.keywordOpportunitiesKpiSite, {
            terms: siteTopTermsAll.length.toLocaleString(),
          })
        : null;

  const kpiStats: Array<{
    key: string;
    label: string;
    value: string;
    icon: ReactNode;
    iconWrapClassName: string;
    valueClassName?: string;
  }> = useGscMode
    ? [
        {
          key: 'quickWins',
          label: vo.keywordStatQuickWins,
          value: gscQuickWinsAll.length.toLocaleString(),
          icon: <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />,
          iconWrapClassName: 'bg-amber-500/10',
          valueClassName: 'text-amber-600 dark:text-amber-400',
        },
        {
          key: 'estClicks',
          label: vo.keywordStatEstClicks,
          value: `+${sumGscQuickWinClicks(kwRows).toLocaleString()}`,
          icon: <MousePointerClick className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />,
          iconWrapClassName: 'bg-emerald-500/10',
          valueClassName: 'text-emerald-600 dark:text-emerald-400',
        },
        {
          key: 'expansion',
          label: vo.keywordStatExpansionTerms,
          value: gscOpportunitiesAll.length.toLocaleString(),
          icon: <Lightbulb className="h-5 w-5 text-violet-600 dark:text-violet-300" aria-hidden />,
          iconWrapClassName: 'bg-violet-500/10',
          valueClassName: 'text-violet-600 dark:text-violet-300',
        },
      ]
    : showCrawlColumns
      ? [
          {
            key: 'actions',
            label: vo.quickWinsEase,
            value: crawlQuickWinsAll.length.toLocaleString(),
            icon: <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />,
            iconWrapClassName: 'bg-amber-500/10',
            valueClassName: 'text-amber-600 dark:text-amber-400',
          },
          {
            key: 'highEmphasis',
            label: vo.highEmphasis,
            value: crawlHighValueAll.length.toLocaleString(),
            icon: <Lightbulb className="h-5 w-5 text-violet-600 dark:text-violet-300" aria-hidden />,
            iconWrapClassName: 'bg-violet-500/10',
            valueClassName: 'text-violet-600 dark:text-violet-300',
          },
        ]
      : showSiteTerms
        ? [
            {
              key: 'siteTerms',
              label: vo.siteTopTerms,
              value: siteTopTermsAll.length.toLocaleString(),
              icon: <Tag className="h-5 w-5 text-link" aria-hidden />,
              iconWrapClassName: 'bg-link/10',
            },
          ]
        : [];

  const showGscUpsell = !hasGscEnrichment && !hasGoogleConnected;

  const devData = useMemo(
    () => ({
      widget: 'overview.keywordOpportunities',
      mode: useGscMode
        ? 'gsc'
        : showCrawlColumns
          ? 'crawl'
          : showSiteTerms
            ? 'siteTerms'
            : 'topicsOnly',
      kpiLine,
      counts: {
        gscQuickWins: gscQuickWinsAll.length,
        gscOpportunities: gscOpportunitiesAll.length,
        gscQuickWinEstClicks: sumGscQuickWinClicks(kwRows),
        crawlQuickWins: crawlQuickWinsAll.length,
        crawlHighEmphasis: crawlHighValueAll.length,
        siteTopTerms: siteTopTermsAll.length,
        topicClusters: topicClusters.length,
      },
      previews: {
        gscQuickWins,
        gscOpportunities,
        crawlQuickWins,
        crawlHighValue,
        siteTopTerms,
        topicClusters,
      },
      flags: {
        useGscMode,
        showCrawlColumns,
        showSiteTerms,
        hasGscEnrichment,
        hasGoogleConnected,
        showGscUpsell,
      },
      links: {
        keywordsHref,
        quickWinsHref,
        opportunitiesHref,
        topicsHref,
      },
      raw: {
        keywords,
        keyword_opportunities: keywordOpportunities,
        content_analytics_top_keywords: contentAnalytics?.top_keywords_site,
      },
    }),
    [
      contentAnalytics?.top_keywords_site,
      crawlHighValue,
      crawlHighValueAll.length,
      crawlQuickWins,
      crawlQuickWinsAll.length,
      gscOpportunities,
      gscOpportunitiesAll.length,
      gscQuickWins,
      gscQuickWinsAll.length,
      hasGoogleConnected,
      hasGscEnrichment,
      keywordOpportunities,
      keywords,
      keywordsHref,
      kpiLine,
      kwRows,
      opportunitiesHref,
      quickWinsHref,
      showCrawlColumns,
      showGscUpsell,
      showSiteTerms,
      siteTopTerms,
      siteTopTermsAll.length,
      topicClusters,
      topicsHref,
      useGscMode,
    ],
  );

  const topicThemesDevData = useMemo(() => {
    const themes = topicClusters.flatMap((cl) => {
      const label = String(cl.top_keyword ?? cl.representative ?? '');
      if (!label || isJunkSemanticTerm(label)) return [];
      const termCount = Array.isArray(cl.keywords)
        ? cl.keywords.filter((kw) => !isJunkSemanticTerm(String(kw))).length
        : 0;
      return [{ label, termCount, cluster: cl }];
    });
    return {
      widget: 'overview.keywordOpportunities.topThemes',
      title: vo.topThemes,
      previewCount: themes.length,
      themes,
      viewAllHref: topicsHref,
      raw: {
        token_topic_clusters: keywordOpportunities?.token_topic_clusters,
      },
    };
  }, [keywordOpportunities?.token_topic_clusters, topicClusters, topicsHref, vo.topThemes]);

  if (!showCard) return null;

  return (
    <Card shadow devData={devData} className="mb-8 overflow-hidden border border-default">
      <div className="border-b border-muted/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
              <h2 className="text-lg font-bold text-bright">{vo.keywordOpportunities}</h2>
              <HelpHint ariaLabel={vo.keywordOpportunitiesHelpTitle} side="bottom">
                {useGscMode ? vo.keywordOpportunitiesGscHint : vo.keywordOpportunitiesHint}
              </HelpHint>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{vo.keywordOpportunitiesSubtitle}</p>
            {hasGscEnrichment ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {vo.keywordOpportunitiesGscConnected}
              </p>
            ) : null}
          </div>
          <Link
            to={keywordsHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            {vo.viewKeywords}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {kpiStats.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {kpiStats.map((stat) => (
              <OverviewStatChip
                key={stat.key}
                className="min-w-[170px]"
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                iconWrapClassName={stat.iconWrapClassName}
                valueClassName={stat.valueClassName}
              />
            ))}
          </div>
        ) : null}

        {showGscUpsell ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <TrendingUp className="h-4 w-4 shrink-0 text-link" aria-hidden />
                {vo.keywordOpportunitiesConnectGsc}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{vo.keywordOpportunitiesConnectGscDetail}</p>
            </div>
            <button
              type="button"
              onClick={() => dispatchOpenIntegrations()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-default bg-brand-900/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-800"
            >
              <Settings2 className="h-4 w-4" />
              {vo.keywordOpportunitiesConnectCta}
            </button>
          </div>
        ) : null}
      </div>

      {(useGscMode || showCrawlColumns || showSiteTerms) && (
        <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
          {useGscMode ? (
            <>
              {gscQuickWins.length > 0 ? (
                <PreviewColumn
                  title={ke.overview.topQuickWins}
                  icon={Zap}
                  iconClassName="text-amber-500"
                  viewAllHref={quickWinsHref}
                  viewAllLabel={ke.overview.viewAll}
                  devData={{
                    widget: 'overview.keywordOpportunities.gscQuickWins',
                    title: ke.overview.topQuickWins,
                    previewCount: gscQuickWins.length,
                    totalCount: gscQuickWinsAll.length,
                    rows: gscQuickWins,
                    viewAllHref: quickWinsHref,
                  }}
                >
                  <ul className="space-y-2">
                    {gscQuickWins.map((row) => (
                      <KeywordPreviewRow
                        key={`gsc-qw-${row.keyword}`}
                        href={keywordRowHref('quickwins')}
                        keyword={String(row.keyword ?? '')}
                        suffix={formatGscQuickWinSuffix(row)}
                        metricClassName="text-amber-700 dark:text-amber-300"
                        icon={intentIcon(row.intent)}
                      />
                    ))}
                  </ul>
                </PreviewColumn>
              ) : null}
              {gscOpportunities.length > 0 ? (
                <PreviewColumn
                  title={ke.overview.topOpportunities}
                  icon={Lightbulb}
                  iconClassName="text-violet-400"
                  viewAllHref={opportunitiesHref}
                  viewAllLabel={ke.overview.viewAll}
                  devData={{
                    widget: 'overview.keywordOpportunities.gscOpportunities',
                    title: ke.overview.topOpportunities,
                    previewCount: gscOpportunities.length,
                    totalCount: gscOpportunitiesAll.length,
                    rows: gscOpportunities,
                    viewAllHref: opportunitiesHref,
                  }}
                >
                  <ul className="space-y-2">
                    {gscOpportunities.map((row) => (
                      <KeywordPreviewRow
                        key={`gsc-opp-${row.keyword}`}
                        href={keywordRowHref('opportunities')}
                        keyword={String(row.keyword ?? '')}
                        suffix={formatGscOpportunitySuffix(row)}
                        metricClassName="text-violet-700 dark:text-violet-300"
                        icon={intentIcon(row.intent)}
                      />
                    ))}
                  </ul>
                </PreviewColumn>
              ) : null}
            </>
          ) : showSiteTerms ? (
            <PreviewColumn
              title={vo.siteTopTerms}
              icon={Tag}
              iconClassName="text-link"
              viewAllHref={keywordsHref}
              viewAllLabel={ke.overview.viewAll}
              devData={{
                widget: 'overview.keywordOpportunities.siteTopTerms',
                title: vo.siteTopTerms,
                previewCount: siteTopTerms.length,
                totalCount: siteTopTermsAll.length,
                rows: siteTopTerms,
                viewAllHref: keywordsHref,
              }}
            >
              <ul className="space-y-2">
                {siteTopTerms.map((term) => (
                  <KeywordPreviewRow
                    key={`site-term-${term.keyword}`}
                    href={keywordsHref}
                    keyword={term.keyword}
                    suffix={format(vo.siteTermMentions, { n: term.count.toLocaleString() })}
                  />
                ))}
              </ul>
            </PreviewColumn>
          ) : (
            <>
              {crawlQuickWins.length > 0 ? (
                <PreviewColumn
                  title={vo.quickWinsEase}
                  icon={Zap}
                  iconClassName="text-amber-500"
                  viewAllHref={keywordsHref}
                  viewAllLabel={ke.overview.viewAll}
                  devData={{
                    widget: 'overview.keywordOpportunities.crawlQuickWins',
                    title: vo.quickWinsEase,
                    previewCount: crawlQuickWins.length,
                    totalCount: crawlQuickWinsAll.length,
                    rows: crawlQuickWins,
                    viewAllHref: keywordsHref,
                  }}
                >
                  <ul className="space-y-2">
                    {crawlQuickWins.map((k, idx) => (
                      <KeywordPreviewRow
                        key={`crawl-qw-${k.keyword}-${idx}`}
                        href={keywordsHref}
                        keyword={String(k.keyword ?? '')}
                        suffix={formatCrawlActionLabel(k.recommended_action, vo.crawlActionLabels)}
                      />
                    ))}
                  </ul>
                </PreviewColumn>
              ) : null}
              {crawlHighValue.length > 0 ? (
                <PreviewColumn
                  title={vo.highEmphasis}
                  icon={Lightbulb}
                  iconClassName="text-violet-400"
                  viewAllHref={keywordsHref}
                  viewAllLabel={ke.overview.viewAll}
                  devData={{
                    widget: 'overview.keywordOpportunities.crawlHighEmphasis',
                    title: vo.highEmphasis,
                    previewCount: crawlHighValue.length,
                    totalCount: crawlHighValueAll.length,
                    rows: crawlHighValue,
                    viewAllHref: keywordsHref,
                  }}
                >
                  <ul className="space-y-2">
                    {crawlHighValue.map((k, idx) => (
                      <KeywordPreviewRow
                        key={`crawl-hv-${k.keyword}-${idx}`}
                        href={keywordsHref}
                        keyword={String(k.keyword ?? '')}
                        suffix={
                          formatCrawlPagesSuffix(k, (n) => format(vo.onPagesCount, { n })) || sj.emDash
                        }
                      />
                    ))}
                  </ul>
                </PreviewColumn>
              ) : null}
            </>
          )}
        </div>
      )}

      {topicClusters.length > 0 ? (
        <div className="relative group/dev-card border-t border-muted/60 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <DevCopyJsonButton data={topicThemesDevData} />
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Tag className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
              {vo.topThemes}
            </h3>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-default bg-brand-900/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {format(vo.topThemesCount, { n: topicClusters.length })}
              </span>
              <Link to={topicsHref} className="text-xs font-medium text-link hover:underline">
                {vo.topThemesViewAll}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {topicClusters.map((cl, idx) => {
              const label = String(cl.top_keyword ?? cl.representative ?? '');
              if (!label || isJunkSemanticTerm(label)) return null;
              const termCount = Array.isArray(cl.keywords)
                ? cl.keywords.filter((kw) => !isJunkSemanticTerm(String(kw))).length
                : 0;
              return (
                <Link
                  key={`theme-${label}-${idx}`}
                  to={topicsHref}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-default bg-brand-900/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:border-blue-500/30 hover:bg-brand-900/70"
                  title={label}
                >
                  <span className="truncate font-medium">{label}</span>
                  {termCount > 0 ? (
                    <span className="shrink-0 text-muted-foreground">
                      {format(vo.topThemeTermCount, { n: termCount })}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function buildKeywordsHref(searchParams: string): string {
  const base = `/${viewIdToPathSlug('keywords-explorer')}`;
  return searchParams ? `${base}?${searchParams}` : base;
}
