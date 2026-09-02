
import type { ReactNode } from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Ga4PageRow, UrlJoinData } from '@/types';
import type { TableColumn } from '@/types/components';
import { Users, AlertCircle, Settings2, Download, Loader2 } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { useTabSections } from '@/hooks/useTabSections';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { TRAFFIC_TAB_SECTIONS } from '@/lib/reportViewSections';
import { strings, format } from '../lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { integrationGuideHref } from '@/lib/docs/integrationGuides';
import { PageLayout, PageHeader, Card, AlertBanner, StatCard, ViewTabs, EmptyState } from '../components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import GoogleTableToolbar from '../components/google/GoogleTableToolbar';
import { filterBySearch, exportCsv } from '../components/google/tableUtils';
import UrlCoverageDoughnut from '../components/google/UrlCoverageDoughnut';
import UrlGapListsPanel from '../components/google/UrlGapListsPanel';
import {
  TopPagesBySessionsChart,
  EngagementDistributionChart,
  SessionsEngagementScatter,
  Ga4DailyTrendChart,
  Ga4ChannelDoughnut,
  Ga4DeviceDoughnut,
} from '../components/traffic/Ga4Charts';
import {
  filterLowEngagement,
  formatEngagementPercent,
  formatDuration,
  buildPageExportColumns,
  buildEngagementBuckets,
} from '../components/traffic/ga4TableUtils';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults';
import { buildLinksInspectHref } from '../lib/reportNav';
import GoogleDataRefreshButton from '@/components/google/GoogleDataRefreshButton';
import { useSearchParams } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';

const TABS = ['overview', 'pages', 'engagement', 'coverage'] as const;
type Ga4TabId = (typeof TABS)[number];

const DATE_RANGE_LABEL = (s?: string, e?: string) => (s && e ? `${s} to ${e}` : '');

function EngagementBadge({ rate }: { rate?: number | null }) {
  if (rate == null) return <span className="text-muted-foreground">—</span>;
  const pct = rate <= 1 ? rate * 100 : rate;
  const color =
    pct >= 50
      ? 'text-green-700 dark:text-green-400'
      : pct >= 25
        ? 'text-yellow-700 dark:text-yellow-400'
        : 'text-red-700 dark:text-red-400';
  return <span className={`font-semibold tabular-nums ${color}`}>{pct.toFixed(1)}%</span>;
}

export default function Traffic() {
  const { data } = useReport();
  useSectionData('traffic');
  const trafficReady = useSectionsViewReady(['traffic']);
  const tf = strings.views.traffic;
  const sp = strings.views.searchPerformance;
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'overview');
  useTabSections(TRAFFIC_TAB_SECTIONS, true);
  const [pathSearch, setPathSearch] = useState('');

  useEffect(() => {
    syncChartJsDefaultsColor();
  }, []);

  const google = data?.google;
  const ga4 = google?.ga4;
  const urlJoin: UrlJoinData | undefined = google?.url_join;

  const dateRange = DATE_RANGE_LABEL(google?.date_range?.start, google?.date_range?.end);
  let subtitle = dateRange ? format(tf.subtitle, { range: dateRange }) : tf.subtitleNoRange;
  if (ga4?.property_id) {
    subtitle = `${subtitle} · ${format(tf.subtitleProperty, { id: ga4.property_id })}`;
  }

  const lowEngagement = useMemo(
    () => filterLowEngagement(ga4?.top_pages ?? []),
    [ga4?.top_pages],
  );

  const filteredPages = useMemo(
    () => filterBySearch(ga4?.top_pages || [], pathSearch, 'path'),
    [ga4?.top_pages, pathSearch],
  );

  const pageColumns = useMemo(
    (): TableColumn[] => [
      {
        key: 'path',
        label: tf.table.path,
        render: (v) => <span className="font-mono text-xs">{String(v ?? '')}</span>,
      },
      {
        key: 'sessions',
        label: tf.table.sessions,
        hint: 'shared.sessions',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'activeUsers',
        label: tf.table.users,
        hint: 'shared.activeUsers',
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'screenPageViews',
        label: tf.table.pageViews,
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'engagementRate',
        label: tf.table.engagement,
        render: (v) => <EngagementBadge rate={v as number | null} />,
      },
      {
        key: 'avgSessionDuration',
        label: tf.table.avgDuration,
        render: (v) => (
          <span className="tabular-nums text-muted-foreground">{formatDuration(v as number | null | undefined)}</span>
        ),
      },
      {
        key: '_inspect',
        label: '',
        render: (_v, row) => {
          const target = String((row as Ga4PageRow & { full_url?: string }).full_url || '');
          if (!target) return null;
          return (
            <a
              href={buildLinksInspectHref(target, searchParams)}
              className="text-xs text-link hover:underline whitespace-nowrap"
            >
              {strings.components?.urlGapLists?.openInLinks || 'Link Explorer'}
            </a>
          );
        },
      },
    ],
    [tf, searchParams],
  );

  const paginationLabels = {
    showingSlice: tf.table.showingSlice,
    pageOf: tf.table.pageOf,
    of: tf.table.of,
    previous: tf.table.previous,
    next: tf.table.next,
    rowsPerPage: tf.table.rowsPerPage,
  };

  const insights = useMemo(() => {
    const bullets = [];
    const top = ga4?.top_pages?.[0];
    if (top?.path) {
      const rate = top.engagementRate;
      const eng =
        rate != null
          ? (rate <= 1 ? rate * 100 : rate).toFixed(1)
          : '0';
      bullets.push(
        format(tf.insights.topPage, {
          path: top.path,
          sessions: (top.sessions || 0).toLocaleString(),
          engagement: eng,
        }),
      );
    }
    if (lowEngagement.length > 0) {
      bullets.push(format(tf.insights.lowEngagement, { count: lowEngagement.length }));
    }
    if ((urlJoin?.ga4_only ?? 0) > 0) {
      bullets.push(format(tf.insights.ga4Only, { count: urlJoin!.ga4_only }));
    }
    return bullets;
  }, [ga4, lowEngagement, urlJoin, tf]);

  const coverageBadge = (urlJoin?.ga4_only ?? 0) > 0 ? urlJoin!.ga4_only! : null;

  const fetchedDate = google?.fetched_at ? new Date(String(google.fetched_at)) : null;
  const headerMeta: ReactNode = fetchedDate && !Number.isNaN(fetchedDate.getTime()) ? (
    <span>
      {' '}
      &middot; {format(tf.fetchedAt, { date: fetchedDate.toLocaleDateString() })}
    </span>
  ) : null;

  const kpiDevData = useMemo(
    () => ({
      widget: 'traffic.kpiSummary',
      dateRange: dateRange || null,
      propertyId: ga4?.property_id ?? null,
      sessions: ga4?.summary?.sessions ?? null,
      activeUsers: ga4?.summary?.activeUsers ?? null,
      screenPageViews: ga4?.summary?.screenPageViews ?? null,
    }),
    [dateRange, ga4?.property_id, ga4?.summary],
  );

  const dailyTrendDevData = useMemo(
    () => ({
      widget: 'traffic.overview.dailyTrend',
      rows: ga4?.daily ?? [],
    }),
    [ga4?.daily],
  );

  const topPagesOverviewDevData = useMemo(
    () => ({
      widget: 'traffic.overview.topPages',
      pages: [...(ga4?.top_pages ?? [])]
        .sort((a, b) => (b.sessions || 0) - (a.sessions || 0))
        .slice(0, 10),
    }),
    [ga4?.top_pages],
  );

  const topPagesTabDevData = useMemo(
    () => ({
      widget: 'traffic.pages.chart',
      pages: [...(ga4?.top_pages ?? [])]
        .sort((a, b) => (b.sessions || 0) - (a.sessions || 0))
        .slice(0, 10),
    }),
    [ga4?.top_pages],
  );

  const engagementDistDevData = useMemo(
    () => ({
      widget: 'traffic.overview.engagementDistribution',
      buckets: buildEngagementBuckets(ga4?.top_pages ?? []),
      bucketLabels: tf.charts.engagementBuckets,
    }),
    [ga4?.top_pages, tf.charts.engagementBuckets],
  );

  const channelDevData = useMemo(
    () => ({
      widget: 'traffic.overview.channel',
      rows: ga4?.by_channel ?? [],
    }),
    [ga4?.by_channel],
  );

  const deviceDevData = useMemo(
    () => ({
      widget: 'traffic.overview.device',
      rows: ga4?.by_device ?? [],
    }),
    [ga4?.by_device],
  );

  const urlCoverageOverviewDevData = useMemo(
    () => ({
      widget: 'traffic.overview.urlCoverage',
      matched: urlJoin?.matched ?? null,
      crawlOnly: urlJoin?.crawl_only ?? null,
      gscOnly: urlJoin?.gsc_only ?? null,
      ga4Only: urlJoin?.ga4_only ?? null,
    }),
    [urlJoin],
  );

  const insightsDevData = useMemo(
    () => ({
      widget: 'traffic.overview.insights',
      bullets: insights,
    }),
    [insights],
  );

  const pagesTableDevData = useMemo(
    () => ({
      widget: 'traffic.pages.table',
      searchQuery: pathSearch || null,
      rowCount: filteredPages.length,
      rows: filteredPages,
    }),
    [filteredPages, pathSearch],
  );

  const scatterDevData = useMemo(
    () => ({
      widget: 'traffic.engagement.scatter',
      points: lowEngagement.slice(0, 50).map((row) => ({
        path: row.path,
        sessions: row.sessions ?? 0,
        engagementRate: row.engagementRate ?? null,
      })),
    }),
    [lowEngagement],
  );

  const engagementTableDevData = useMemo(
    () => ({
      widget: 'traffic.engagement.table',
      rowCount: lowEngagement.length,
      rows: lowEngagement,
    }),
    [lowEngagement],
  );

  const coverageDoughnutDevData = useMemo(
    () => ({
      widget: 'traffic.coverage.doughnut',
      matched: urlJoin?.matched ?? null,
      crawlOnly: urlJoin?.crawl_only ?? null,
      gscOnly: urlJoin?.gsc_only ?? null,
      ga4Only: urlJoin?.ga4_only ?? null,
    }),
    [urlJoin],
  );

  const coverageStatsDevData = useMemo(
    () => ({
      widget: 'traffic.coverage.stats',
      matched: urlJoin?.matched ?? null,
      crawlOnly: urlJoin?.crawl_only ?? null,
      gscOnly: urlJoin?.gsc_only ?? null,
      ga4Only: urlJoin?.ga4_only ?? null,
    }),
    [urlJoin],
  );

  const gapListsDevData = useMemo(
    () => ({
      widget: 'traffic.coverage.gapLists',
      ga4Only: urlJoin?.lists?.ga4_only ?? [],
      crawlOnly: urlJoin?.lists?.crawl_only ?? [],
      totals: urlJoin?.lists_total ?? null,
      listLimit: urlJoin?.list_limit ?? null,
    }),
    [urlJoin],
  );

  if (!google) {
    if (!trafficReady) {
      return <ViewSectionLoading title={tf.title} />;
    }
    return (
      <PageLayout className="space-y-6">
        <EmptyState
          icon={Users}
          title={tf.emptyTitle}
          description={
            <>
              {tf.emptyBody}
              <span className="mt-3 flex items-center justify-center gap-1 flex-wrap text-xs">
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                {tf.emptyIntegrationsHint}{' '}
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
    if (!e.startsWith('GA4:')) return false;
    if (ga4?.summary) return false;
    return true;
  });

  const ga4TabItems = TABS.map((id) => {
    let badge: number | null = null;
    if (id === 'engagement') badge = lowEngagement.length || null;
    if (id === 'coverage') badge = coverageBadge;
    return {
      id,
      label: (tf.tabs as Record<Ga4TabId, string>)[id],
      badge,
    };
  });

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        icon={<Users className="h-7 w-7 text-purple-700 dark:text-purple-400 shrink-0" />}
        title={tf.title}
        subtitle={
          <>
            {subtitle}
            {headerMeta}
          </>
        }
        actions={<GoogleDataRefreshButton variant="google" />}
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

      {ga4?.summary && (
        <div className="relative group/dev-card">
          <DevCopyJsonButton data={kpiDevData} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              label={tf.kpi.sessions}
              value={ga4.summary.sessions?.toLocaleString()}
              hint={metricHelpHint('shared.sessions')}
            />
            <StatCard
              label={tf.kpi.users}
              value={ga4.summary.activeUsers?.toLocaleString()}
              hint={metricHelpHint('shared.activeUsers')}
            />
            <StatCard label={tf.kpi.pageViews} value={ga4.summary.screenPageViews?.toLocaleString()} hint={metricHelpHint('shared.pageViews')} />
          </div>
        </div>
      )}

      {!ga4 ? (
        !errors.length && <p className="text-sm text-muted-foreground">{tf.notConfigured}</p>
      ) : (
        <>
          <ViewTabs
            tabs={ga4TabItems}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as Ga4TabId)}
            ariaLabel={tf.title}
            idPrefix="ga4"
            className="mb-2"
          />

          {activeTab === 'overview' && (
            <div id="ga4-tab-overview" role="tabpanel" aria-labelledby="ga4-tab-btn-overview" className="space-y-6">
              {(ga4.daily?.length ?? 0) > 0 && (
                <Ga4DailyTrendChart daily={ga4.daily ?? []} devData={dailyTrendDevData} />
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopPagesBySessionsChart pages={ga4.top_pages ?? []} devData={topPagesOverviewDevData} />
                <EngagementDistributionChart pages={ga4.top_pages ?? []} devData={engagementDistDevData} />
              </div>
              {((ga4.by_channel?.length ?? 0) > 0 || (ga4.by_device?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(ga4.by_channel?.length ?? 0) > 0 && (
                    <Ga4ChannelDoughnut by_channel={ga4.by_channel ?? []} devData={channelDevData} />
                  )}
                  {(ga4.by_device?.length ?? 0) > 0 && (
                    <Ga4DeviceDoughnut by_device={ga4.by_device ?? []} devData={deviceDevData} />
                  )}
                </div>
              )}
              {urlJoin ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <UrlCoverageDoughnut urlJoin={urlJoin} devData={urlCoverageOverviewDevData} />
                  <div className="relative group/dev-card bg-brand-800 border border-default rounded-xl p-4">
                    <DevCopyJsonButton data={insightsDevData} />
                    <h3 className="text-sm font-bold text-foreground mb-3">{tf.coverage.title}</h3>
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
              ) : (
                insights.length > 0 && (
                  <div className="relative group/dev-card bg-brand-800 border border-default rounded-xl p-4">
                    <DevCopyJsonButton data={insightsDevData} />
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {insights.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'pages' && (
            <div id="ga4-tab-pages" role="tabpanel" aria-labelledby="ga4-tab-btn-pages" className="space-y-4">
              <TopPagesBySessionsChart pages={ga4.top_pages ?? []} devData={topPagesTabDevData} />
              <Card padding="none" className="overflow-hidden" devData={pagesTableDevData}>
                <GoogleTableToolbar
                  searchPlaceholder={tf.pages.searchPlaceholder}
                  search={pathSearch}
                  onSearch={setPathSearch}
                  exportLabel={tf.pages.exportCsv}
                  onExport={() =>
                    exportCsv(
                      filteredPages.map((r: Ga4PageRow) => ({
                        ...r,
                        engagementRate: formatEngagementPercent(r.engagementRate),
                        avgSessionDuration: formatDuration(r.avgSessionDuration),
                      })),
                      buildPageExportColumns(tf),
                      'ga4-pages.csv',
                    )
                  }
                />
                <div className="p-4 pt-2">
                  <SortablePaginatedTable
                    columns={pageColumns}
                    rows={filteredPages}
                    defaultSort="sessions"
                    rowKeyField="path"
                    emptyMessage={tf.table.noData}
                    paginationLabels={paginationLabels}
                  />
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'engagement' && (
            <div
              id="ga4-tab-engagement"
              role="tabpanel"
              aria-labelledby="ga4-tab-btn-engagement"
              className="space-y-4"
            >
              <p className="text-xs text-muted-foreground">{tf.engagement.description}</p>
              <SessionsEngagementScatter rows={lowEngagement} devData={scatterDevData} />
              <Card padding="none" className="overflow-hidden" devData={engagementTableDevData}>
                <div className="flex justify-end p-4 pb-0">
                  <button
                    type="button"
                    onClick={() =>
                      exportCsv(
                        lowEngagement.map((r: Ga4PageRow) => ({
                          ...r,
                          engagementRate: formatEngagementPercent(r.engagementRate),
                          avgSessionDuration: formatDuration(r.avgSessionDuration),
                        })),
                        buildPageExportColumns(tf),
                        'ga4-low-engagement.csv',
                      )
                    }
                    className="px-3 py-1.5 text-xs bg-brand-900 border border-default rounded-lg text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {tf.engagement.exportCsv}
                  </button>
                </div>
                <div className="p-4 pt-2">
                  <SortablePaginatedTable
                    columns={pageColumns}
                    rows={lowEngagement}
                    defaultSort="sessions"
                    rowKeyField="path"
                    emptyMessage={tf.table.noData}
                    paginationLabels={paginationLabels}
                  />
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'coverage' && (
            <div id="ga4-tab-coverage" role="tabpanel" aria-labelledby="ga4-tab-btn-coverage" className="space-y-6">
              <p className="text-sm text-muted-foreground">{tf.coverage.description}</p>
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
                  {(urlJoin.lists?.ga4_only?.length ?? 0) > 0 || (urlJoin.lists?.crawl_only?.length ?? 0) > 0 ? (
                    <UrlGapListsPanel
                      urlJoin={urlJoin}
                      searchParams={searchParams}
                      showGa4
                      showCrawl
                      showGsc={false}
                      devData={gapListsDevData}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground border border-default/60 rounded-lg px-3 py-2 bg-brand-800/50">
                      {tf.coverage.urlListNote}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{tf.coverage.noData}</p>
              )}
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
