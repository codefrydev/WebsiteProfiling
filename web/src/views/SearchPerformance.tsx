
import type { ReactNode } from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { GscPageRow, UrlJoinData } from '@/types';
import type { TableColumn } from '@/types/components';
import { TrendingUp, Search, AlertCircle, Settings2, Download, Loader2 } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { useTabSections } from '@/hooks/useTabSections';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { SEARCH_PERFORMANCE_TAB_SECTIONS } from '@/lib/reportViewSections';
import { strings, format } from '../lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { integrationGuideHref } from '@/lib/docs/integrationGuides';
import { PageLayout, PageHeader, Card, AlertBanner, StatCard, ViewTabs, EmptyState } from '../components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import GoogleTableToolbar from '../components/google/GoogleTableToolbar';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults';
import {
  TopQueriesBarChart,
  TopPagesBarChart,
  PositionDistributionChart,
  UrlCoverageDoughnut,
  CtrOpportunityScatter,
  GscDailyTrendChart,
} from '../components/searchPerformance/GscCharts';
import { filterBySearch, exportCsv } from '../components/google/tableUtils';
import {
  filterOpportunities,
  buildQueryExportColumns,
  buildPageExportColumns,
  buildPositionBuckets,
} from '../components/searchPerformance/gscTableUtils';
import UrlGapListsPanel from '../components/google/UrlGapListsPanel';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import GoogleDataRefreshButton from '@/components/google/GoogleDataRefreshButton';
import { useSearchParams } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';

const TABS = ['overview', 'queries', 'pages', 'opportunities', 'coverage'] as const;
type GscTabId = (typeof TABS)[number];

const DATE_RANGE_LABEL = (s?: string, e?: string) => (s && e ? `${s} to ${e}` : '');

function PositionBadge({ pos }: { pos?: number | string | null }) {
  if (pos == null) return <span className="text-muted-foreground">—</span>;
  const n = Number(pos);
  const p = (Number.isFinite(n) ? n : 0).toFixed(1);
  const color =
    n <= 3
      ? 'text-green-700 dark:text-green-400'
      : n <= 10
        ? 'text-yellow-700 dark:text-yellow-400'
        : n <= 20
          ? 'text-orange-700 dark:text-orange-400'
          : 'text-red-700 dark:text-red-400';
  return <span className={`font-mono font-bold tabular-nums ${color}`}>{p}</span>;
}

export default function SearchPerformance() {
  const { data } = useReport();
  useSectionData('traffic');
  const trafficReady = useSectionsViewReady(['traffic']);
  const sp = strings.views.searchPerformance;
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'overview');
  useTabSections(SEARCH_PERFORMANCE_TAB_SECTIONS, true);
  const [querySearch, setQuerySearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');

  useEffect(() => {
    syncChartJsDefaultsColor();
  }, []);

  const google = data?.google;
  const gsc = google?.gsc;

  const dateRange = DATE_RANGE_LABEL(google?.date_range?.start, google?.date_range?.end);
  const subtitle = dateRange
    ? format(sp.subtitle, { range: dateRange })
    : sp.subtitleNoRange;

  const opportunities = useMemo(
    () => filterOpportunities(gsc?.top_queries ?? []),
    [gsc?.top_queries],
  );

  const filteredQueries = useMemo(
    () => filterBySearch(gsc?.top_queries || [], querySearch, 'query'),
    [gsc?.top_queries, querySearch],
  );

  const filteredPages = useMemo(
    () => filterBySearch(gsc?.top_pages || [], pageSearch, 'page'),
    [gsc?.top_pages, pageSearch],
  );

  const urlJoin: UrlJoinData | undefined = google?.url_join;

  const queryColumns = useMemo(
    (): TableColumn[] => [
      {
        key: 'query',
        label: sp.table.query,
        render: (v) => <span className="font-mono text-xs">{String(v ?? '')}</span>,
      },
      {
        key: 'clicks',
        label: sp.table.clicks,
        hint: 'shared.clicks',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'impressions',
        label: sp.table.impressions,
        hint: 'shared.impressions',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'ctr',
        label: sp.table.ctr,
        hint: 'shared.ctr',
        render: (v) => <span className="tabular-nums">{v != null ? `${v}%` : '—'}</span>,
      },
      {
        key: 'position',
        label: sp.table.position,
        hint: 'shared.position',
        render: (v) => <PositionBadge pos={v as number | string | null} />,
      },
    ],
    [sp],
  );

  const pageColumns = useMemo(
    (): TableColumn[] => [
      {
        key: 'page',
        label: sp.table.page,
        render: (v) => (
          <a
            href={String(v ?? '')}
            target="_blank"
            rel="noreferrer"
            title={String(v ?? '')}
            className="text-link hover:underline font-mono text-xs truncate block min-w-0 max-w-none"
          >
            {String(v ?? '')}
          </a>
        ),
      },
      {
        key: 'clicks',
        label: sp.table.clicks,
        hint: 'shared.clicks',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'impressions',
        label: sp.table.impressions,
        hint: 'shared.impressions',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'ctr',
        label: sp.table.ctr,
        hint: 'shared.ctr',
        render: (v) => <span className="tabular-nums">{v != null ? `${v}%` : '—'}</span>,
      },
      {
        key: 'position',
        label: sp.table.position,
        hint: 'shared.position',
        render: (v) => <PositionBadge pos={v as number | string | null} />,
      },
      {
        key: '_inspect',
        label: '',
        render: (_v, row) => (
          <UrlInspectorButton
            url={String((row as GscPageRow).page ?? '')}
            label="Inspect"
          />
        ),
      },
    ],
    [sp],
  );

  const paginationLabels = {
    showingSlice: sp.table.showingSlice,
    pageOf: sp.table.pageOf,
    of: sp.table.of,
    previous: sp.table.previous,
    next: sp.table.next,
    rowsPerPage: sp.table.rowsPerPage,
  };

  const insights = useMemo(() => {
    const bullets = [];
    const topQ = gsc?.top_queries?.[0];
    if (topQ?.query) {
      bullets.push(
        format(sp.insights.topQuery, {
          query: topQ.query,
          clicks: (topQ.clicks || 0).toLocaleString(),
          impressions: (topQ.impressions || 0).toLocaleString(),
        }),
      );
    }
    if (opportunities.length > 0) {
      bullets.push(format(sp.insights.lowCtr, { count: opportunities.length }));
    }
    if ((urlJoin?.gsc_only ?? 0) > 0) {
      bullets.push(format(sp.insights.gscOnly, { count: urlJoin!.gsc_only }));
    }
    return bullets;
  }, [gsc, opportunities, urlJoin, sp]);

  const tabLabels = sp.tabs as Record<GscTabId, string>;
  const coverageBadge = (urlJoin?.gsc_only ?? 0) > 0 ? urlJoin!.gsc_only! : null;

  const fetchedDate = google?.fetched_at ? new Date(String(google.fetched_at)) : null;
  const headerMeta: ReactNode = fetchedDate && !Number.isNaN(fetchedDate.getTime()) ? (
    <span>
      {' '}
      &middot; {format(sp.fetchedAt, { date: fetchedDate.toLocaleDateString() })}
    </span>
  ) : null;

  const serializeQuery = (row: { query?: string; clicks?: number; impressions?: number; ctr?: number | string | null; position?: number | string | null }) => ({
    query: row.query ?? '',
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? null,
    position: row.position ?? null,
  });

  const serializePage = (row: GscPageRow) => ({
    page: row.page ?? '',
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? null,
    position: row.position ?? null,
  });

  const kpiDevData = useMemo(
    () => ({
      widget: 'searchPerformance.kpiSummary',
      dateRange: dateRange || null,
      clicks: gsc?.summary?.clicks ?? null,
      impressions: gsc?.summary?.impressions ?? null,
      ctr: gsc?.summary?.ctr ?? null,
      position: gsc?.summary?.position ?? null,
    }),
    [dateRange, gsc?.summary],
  );

  const dailyTrendDevData = useMemo(
    () => ({
      widget: 'searchPerformance.overview.dailyTrend',
      rows: gsc?.daily ?? [],
    }),
    [gsc?.daily],
  );

  const topQueriesOverviewDevData = useMemo(
    () => ({
      widget: 'searchPerformance.overview.topQueries',
      queries: (gsc?.top_queries ?? []).slice(0, 10).map(serializeQuery),
    }),
    [gsc?.top_queries],
  );

  const topQueriesTabDevData = useMemo(
    () => ({
      widget: 'searchPerformance.queries.chart',
      queries: (gsc?.top_queries ?? []).slice(0, 10).map(serializeQuery),
    }),
    [gsc?.top_queries],
  );

  const positionDistDevData = useMemo(
    () => ({
      widget: 'searchPerformance.overview.positionDistribution',
      buckets: buildPositionBuckets(gsc?.top_queries ?? []),
      bucketLabels: sp.charts.positionBuckets,
    }),
    [gsc?.top_queries, sp.charts.positionBuckets],
  );

  const urlCoverageOverviewDevData = useMemo(
    () => ({
      widget: 'searchPerformance.overview.urlCoverage',
      matched: urlJoin?.matched ?? null,
      crawlOnly: urlJoin?.crawl_only ?? null,
      gscOnly: urlJoin?.gsc_only ?? null,
      ga4Only: urlJoin?.ga4_only ?? null,
    }),
    [urlJoin],
  );

  const insightsDevData = useMemo(
    () => ({
      widget: 'searchPerformance.overview.insights',
      bullets: insights,
    }),
    [insights],
  );

  const queriesTableDevData = useMemo(
    () => ({
      widget: 'searchPerformance.queries.table',
      searchQuery: querySearch || null,
      rowCount: filteredQueries.length,
      rows: filteredQueries.map(serializeQuery),
    }),
    [filteredQueries, querySearch],
  );

  const topPagesTabDevData = useMemo(
    () => ({
      widget: 'searchPerformance.pages.chart',
      pages: (gsc?.top_pages ?? []).slice(0, 10).map(serializePage),
    }),
    [gsc?.top_pages],
  );

  const pagesTableDevData = useMemo(
    () => ({
      widget: 'searchPerformance.pages.table',
      searchQuery: pageSearch || null,
      rowCount: filteredPages.length,
      rows: filteredPages.map(serializePage),
    }),
    [filteredPages, pageSearch],
  );

  const scatterDevData = useMemo(
    () => ({
      widget: 'searchPerformance.opportunities.scatter',
      points: opportunities.slice(0, 50).map(serializeQuery),
    }),
    [opportunities],
  );

  const opportunitiesTableDevData = useMemo(
    () => ({
      widget: 'searchPerformance.opportunities.table',
      rowCount: opportunities.length,
      rows: opportunities.map(serializeQuery),
    }),
    [opportunities],
  );

  const coverageDoughnutDevData = useMemo(
    () => ({
      widget: 'searchPerformance.coverage.doughnut',
      matched: urlJoin?.matched ?? null,
      crawlOnly: urlJoin?.crawl_only ?? null,
      gscOnly: urlJoin?.gsc_only ?? null,
      ga4Only: urlJoin?.ga4_only ?? null,
    }),
    [urlJoin],
  );

  const coverageStatsDevData = useMemo(
    () => ({
      widget: 'searchPerformance.coverage.stats',
      matched: urlJoin?.matched ?? null,
      crawlOnly: urlJoin?.crawl_only ?? null,
      gscOnly: urlJoin?.gsc_only ?? null,
      ga4Only: urlJoin?.ga4_only ?? null,
    }),
    [urlJoin],
  );

  const gapListsDevData = useMemo(
    () => ({
      widget: 'searchPerformance.coverage.gapLists',
      gscOnly: urlJoin?.lists?.gsc_only ?? [],
      crawlOnly: urlJoin?.lists?.crawl_only ?? [],
      totals: urlJoin?.lists_total ?? null,
      listLimit: urlJoin?.list_limit ?? null,
    }),
    [urlJoin],
  );

  if (!google) {
    if (!trafficReady) {
      return <ViewSectionLoading title={sp.title} />;
    }
    return (
      <PageLayout className="space-y-6">
        <EmptyState
          icon={TrendingUp}
          title={sp.emptyTitle}
          description={
            <>
              {sp.emptyBody}
              <span className="mt-3 flex items-center justify-center gap-1 flex-wrap text-xs">
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                {sp.emptyIntegrationsHint}{' '}
                <Link
                  to={integrationGuideHref('google', { from: 'integrations' })}
                  className="text-link hover:underline"
                >
                  {strings.docs.setupGuideLink}
                </Link>
              </span>
            </>
          }
        />
      </PageLayout>
    );
  }

  const errors = (google.errors || []).filter((e: string) => {
    if (e.startsWith('GSC:') && gsc?.summary) return false;
    if (e.startsWith('GA4:') && google.ga4?.summary) return false;
    return true;
  });

  const gscTabItems = TABS.map((id) => {
    let badge: number | null = null;
    if (id === 'opportunities') badge = opportunities.length || null;
    if (id === 'coverage') badge = coverageBadge;
    return {
      id,
      label: tabLabels[id as GscTabId],
      badge: id !== 'queries' && id !== 'pages' ? badge : null,
    };
  });

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        icon={<TrendingUp className="h-7 w-7 text-link shrink-0" />}
        title={sp.title}
        subtitle={
          <>
            {subtitle}
            {headerMeta}
          </>
        }
        actions={<GoogleDataRefreshButton variant="gsc" />}
      />

      {errors.length > 0 && (
        <AlertBanner
          variant="warning"
          icon={<AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden />}
        >
          {errors.map((e: string, i: number) => (
            <p key={i}>{e}</p>
          ))}
        </AlertBanner>
      )}

      {gsc?.summary && (
        <div className="relative group/dev-card">
          <DevCopyJsonButton data={kpiDevData} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label={sp.kpi.clicks}
              value={gsc.summary.clicks?.toLocaleString()}
              hint={metricHelpHint('shared.clicks')}
            />
            <StatCard
              label={sp.kpi.impressions}
              value={gsc.summary.impressions?.toLocaleString()}
              hint={metricHelpHint('shared.impressions')}
            />
            <StatCard
              label={sp.kpi.ctr}
              value={gsc.summary.ctr != null ? `${gsc.summary.ctr}%` : null}
              hint={metricHelpHint('shared.ctr')}
            />
            <StatCard
              label={sp.kpi.position}
              value={gsc.summary.position}
              hint={metricHelpHint('shared.position')}
            />
          </div>
        </div>
      )}

      {!gsc ? (
        <EmptyState icon={TrendingUp} title={sp.title} description={sp.emptyBody} />
      ) : (
        <>
          <ViewTabs
            tabs={gscTabItems}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as GscTabId)}
            ariaLabel={sp.title}
            idPrefix="gsc"
            className="mb-2"
          />

          {activeTab === 'overview' && (
            <div id="gsc-tab-overview" role="tabpanel" aria-labelledby="gsc-tab-btn-overview" className="space-y-6">
              {(gsc.daily?.length ?? 0) > 0 && (
                <GscDailyTrendChart daily={gsc.daily ?? []} devData={dailyTrendDevData} />
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopQueriesBarChart queries={gsc.top_queries ?? []} devData={topQueriesOverviewDevData} />
                <PositionDistributionChart queries={gsc.top_queries ?? []} devData={positionDistDevData} />
              </div>
              {urlJoin && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <UrlCoverageDoughnut urlJoin={urlJoin} devData={urlCoverageOverviewDevData} />
                  <div className="relative group/dev-card bg-brand-800 border border-default rounded-xl p-4">
                    <DevCopyJsonButton data={insightsDevData} />
                    <h3 className="text-sm font-bold text-foreground mb-3">{sp.coverage.title}</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {insights.map((line, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-link shrink-0">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                      {insights.length === 0 && (
                        <li>{strings.common.notEnoughData}</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
              {!urlJoin && insights.length > 0 && (
                <div className="relative group/dev-card bg-brand-800 border border-default rounded-xl p-4">
                  <DevCopyJsonButton data={insightsDevData} />
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {insights.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === 'queries' && (
            <div id="gsc-tab-queries" role="tabpanel" aria-labelledby="gsc-tab-btn-queries" className="space-y-4">
              <TopQueriesBarChart queries={gsc.top_queries ?? []} devData={topQueriesTabDevData} />
              <Card padding="none" className="overflow-hidden" devData={queriesTableDevData}>
                <GoogleTableToolbar
                  searchPlaceholder={sp.queries.searchPlaceholder}
                  search={querySearch}
                  onSearch={setQuerySearch}
                  exportLabel={sp.queries.exportCsv}
                  onExport={() =>
                    exportCsv(filteredQueries, buildQueryExportColumns(sp), 'gsc-queries.csv')
                  }
                />
                <div className="p-4 pt-2">
                  <SortablePaginatedTable
                    columns={queryColumns}
                    rows={filteredQueries}
                    defaultSort="clicks"
                    rowKeyField="query"
                    emptyMessage={sp.table.noData}
                    paginationLabels={paginationLabels}
                  />
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'pages' && (
            <div id="gsc-tab-pages" role="tabpanel" aria-labelledby="gsc-tab-btn-pages" className="space-y-4">
              <TopPagesBarChart pages={gsc.top_pages ?? []} devData={topPagesTabDevData} />
              <Card padding="none" className="overflow-hidden" devData={pagesTableDevData}>
                <GoogleTableToolbar
                  searchPlaceholder={sp.pages.searchPlaceholder}
                  search={pageSearch}
                  onSearch={setPageSearch}
                  exportLabel={sp.pages.exportCsv}
                  onExport={() =>
                    exportCsv(filteredPages, buildPageExportColumns(sp), 'gsc-pages.csv')
                  }
                />
                <div className="p-4 pt-2">
                  <SortablePaginatedTable
                    columns={pageColumns}
                    rows={filteredPages}
                    defaultSort="clicks"
                    rowKeyField="page"
                    emptyMessage={sp.table.noData}
                    paginationLabels={paginationLabels}
                  />
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'opportunities' && (
            <div
              id="gsc-tab-opportunities"
              role="tabpanel"
              aria-labelledby="gsc-tab-btn-opportunities"
              className="space-y-4"
            >
              <p className="text-xs text-muted-foreground">{sp.opportunities.description}</p>
              <CtrOpportunityScatter rows={opportunities} devData={scatterDevData} />
              <Card padding="none" className="overflow-hidden" devData={opportunitiesTableDevData}>
                <div className="flex justify-end p-4 pb-0">
                  <button
                    type="button"
                    onClick={() =>
                      exportCsv(opportunities, buildQueryExportColumns(sp), 'gsc-opportunities.csv')
                    }
                    className="px-3 py-1.5 text-xs bg-brand-900 border border-default rounded-lg text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {sp.opportunities.exportCsv}
                  </button>
                </div>
                <div className="p-4 pt-2">
                  <SortablePaginatedTable
                    columns={queryColumns}
                    rows={opportunities}
                    defaultSort="impressions"
                    rowKeyField="query"
                    emptyMessage={sp.table.noData}
                    paginationLabels={paginationLabels}
                  />
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'coverage' && (
            <div id="gsc-tab-coverage" role="tabpanel" aria-labelledby="gsc-tab-btn-coverage" className="space-y-6">
              <p className="text-sm text-muted-foreground">{sp.coverage.description}</p>
              {urlJoin ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <UrlCoverageDoughnut urlJoin={urlJoin} devData={coverageDoughnutDevData} />
                    <div className="relative group/dev-card">
                      <DevCopyJsonButton data={coverageStatsDevData} />
                      <div className="grid grid-cols-2 gap-3">
                        <StatCard
                          label={sp.urlJoin.matched}
                          value={urlJoin.matched}
                          sub={sp.urlJoin.matchedSub}
                          hint={metricHelpHint('views.overview.urlJoinMatched')}
                        />
                        <StatCard
                          label={sp.urlJoin.crawlOnly}
                          value={urlJoin.crawl_only}
                          sub={sp.urlJoin.crawlOnlySub}
                          hint={metricHelpHint('views.overview.urlJoinCrawlOnly')}
                        />
                        <StatCard
                          label={sp.urlJoin.gscOnly}
                          value={urlJoin.gsc_only}
                          sub={sp.urlJoin.gscOnlySub}
                          hint={metricHelpHint('views.overview.urlJoinGscOnly')}
                        />
                        <StatCard
                          label={sp.urlJoin.ga4Only}
                          value={urlJoin.ga4_only}
                          sub={sp.urlJoin.ga4OnlySub}
                          hint={metricHelpHint('views.overview.urlJoinGa4Only')}
                        />
                      </div>
                    </div>
                  </div>
                  {(urlJoin.lists?.gsc_only?.length ?? 0) > 0 || (urlJoin.lists?.crawl_only?.length ?? 0) > 0 ? (
                    <UrlGapListsPanel
                      urlJoin={urlJoin}
                      searchParams={searchParams}
                      showGsc
                      showCrawl
                      showGa4={false}
                      devData={gapListsDevData}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground border border-default/60 rounded-lg px-3 py-2 bg-brand-800/50">
                      {sp.coverage.urlListNote}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{sp.coverage.noData}</p>
              )}
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
