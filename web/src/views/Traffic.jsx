'use client';

import { useState, useMemo, useEffect } from 'react';
import { Users, AlertCircle, Settings2, Download } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, Card } from '../components';
import SummaryCard from '../components/google/SummaryCard';
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
} from '../components/traffic/ga4TableUtils';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults';
import { buildLinksInspectHref } from '../lib/reportNav';
import { useSearchParams } from 'next/navigation';

const TABS = ['overview', 'pages', 'engagement', 'coverage'];

const DATE_RANGE_LABEL = (s, e) => (s && e ? `${s} to ${e}` : '');

function EngagementBadge({ rate }) {
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
  const tf = strings.views.traffic;
  const sp = strings.views.searchPerformance;
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [pathSearch, setPathSearch] = useState('');

  useEffect(() => {
    syncChartJsDefaultsColor();
  }, []);

  const google = data?.google;
  const ga4 = google?.ga4;
  const urlJoin = google?.url_join;

  const dateRange = DATE_RANGE_LABEL(google?.date_range?.start, google?.date_range?.end);
  let subtitle = dateRange ? format(tf.subtitle, { range: dateRange }) : tf.subtitleNoRange;
  if (ga4?.property_id) {
    subtitle = `${subtitle} · ${format(tf.subtitleProperty, { id: ga4.property_id })}`;
  }

  const lowEngagement = useMemo(
    () => filterLowEngagement(ga4?.top_pages),
    [ga4?.top_pages],
  );

  const filteredPages = useMemo(
    () => filterBySearch(ga4?.top_pages || [], pathSearch, 'path'),
    [ga4?.top_pages, pathSearch],
  );

  const pageColumns = useMemo(
    () => [
      {
        key: 'path',
        label: tf.table.path,
        render: (v) => <span className="font-mono text-xs">{v}</span>,
      },
      {
        key: 'sessions',
        label: tf.table.sessions,
        render: (v) => <span className="tabular-nums">{v?.toLocaleString()}</span>,
      },
      {
        key: 'activeUsers',
        label: tf.table.users,
        render: (v) => <span className="tabular-nums">{v?.toLocaleString()}</span>,
      },
      {
        key: 'screenPageViews',
        label: tf.table.pageViews,
        render: (v) => <span className="tabular-nums">{v?.toLocaleString()}</span>,
      },
      {
        key: 'engagementRate',
        label: tf.table.engagement,
        render: (v) => <EngagementBadge rate={v} />,
      },
      {
        key: 'avgSessionDuration',
        label: tf.table.avgDuration,
        render: (v) => <span className="tabular-nums text-muted-foreground">{formatDuration(v)}</span>,
      },
      {
        key: '_inspect',
        label: '',
        render: (_, row) => {
          const target = row.full_url || '';
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
    if (urlJoin?.ga4_only > 0) {
      bullets.push(format(tf.insights.ga4Only, { count: urlJoin.ga4_only }));
    }
    return bullets;
  }, [ga4, lowEngagement, urlJoin, tf]);

  const coverageBadge = urlJoin?.ga4_only > 0 ? urlJoin.ga4_only : null;

  const headerMeta = google?.fetched_at ? (
    <span>
      {' '}
      &middot; {format(tf.fetchedAt, { date: new Date(google.fetched_at).toLocaleDateString() })}
    </span>
  ) : null;

  if (!google) {
    return (
      <PageLayout>
        <div className="max-w-md mx-auto text-center py-16">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-bright mb-2">{tf.emptyTitle}</h2>
          <p className="text-muted-foreground text-sm mb-6">{tf.emptyBody}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            {tf.emptyIntegrationsHint}
          </p>
        </div>
      </PageLayout>
    );
  }

  const errors = (google.errors || []).filter((e) => {
    if (!e.startsWith('GA4:')) return false;
    if (ga4?.summary) return false;
    return true;
  });

  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bright mb-2 flex items-center gap-2">
          <Users className="h-7 w-7 text-purple-700 dark:text-purple-400 shrink-0" />
          {tf.title}
        </h1>
        <p className="text-muted-foreground">
          {subtitle}
          {headerMeta}
        </p>
      </div>

      {errors.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex gap-2 mb-6">
          <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
            {errors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </div>
      )}

      {ga4?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <SummaryCard label={tf.kpi.sessions} value={ga4.summary.sessions?.toLocaleString()} />
          <SummaryCard label={tf.kpi.users} value={ga4.summary.activeUsers?.toLocaleString()} />
          <SummaryCard label={tf.kpi.pageViews} value={ga4.summary.screenPageViews?.toLocaleString()} />
        </div>
      )}

      {!ga4 ? (
        !errors.length && <p className="text-sm text-muted-foreground">{tf.notConfigured}</p>
      ) : (
        <>
          <div className="border-b border-default mb-6" role="tablist" aria-label={tf.title}>
            <div className="flex gap-0 overflow-x-auto">
              {TABS.map((id) => {
                let badge = null;
                if (id === 'engagement') badge = lowEngagement.length || null;
                if (id === 'coverage') badge = coverageBadge;
                const label = tf.tabs[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    aria-controls={`ga4-tab-${id}`}
                    id={`ga4-tab-btn-${id}`}
                    onClick={() => setActiveTab(id)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === id
                        ? 'border-accent text-accent'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                    {badge > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          activeTab === id ? 'bg-accent/20 text-accent' : 'bg-brand-800 text-muted-foreground'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === 'overview' && (
            <div id="ga4-tab-overview" role="tabpanel" aria-labelledby="ga4-tab-btn-overview" className="space-y-6">
              {ga4.daily?.length > 0 && (
                <Ga4DailyTrendChart daily={ga4.daily} />
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopPagesBySessionsChart pages={ga4.top_pages} />
                <EngagementDistributionChart pages={ga4.top_pages} />
              </div>
              {(ga4.by_channel?.length > 0 || ga4.by_device?.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {ga4.by_channel?.length > 0 && <Ga4ChannelDoughnut by_channel={ga4.by_channel} />}
                  {ga4.by_device?.length > 0 && <Ga4DeviceDoughnut by_device={ga4.by_device} />}
                </div>
              )}
              {urlJoin ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <UrlCoverageDoughnut urlJoin={urlJoin} />
                  <div className="bg-brand-800 border border-default rounded-xl p-4">
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
                  <div className="bg-brand-800 border border-default rounded-xl p-4">
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
              <TopPagesBySessionsChart pages={ga4.top_pages} />
              <Card padding="none" className="overflow-hidden">
                <GoogleTableToolbar
                  searchPlaceholder={tf.pages.searchPlaceholder}
                  search={pathSearch}
                  onSearch={setPathSearch}
                  exportLabel={tf.pages.exportCsv}
                  onExport={() =>
                    exportCsv(
                      filteredPages.map((r) => ({
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
              <SessionsEngagementScatter rows={lowEngagement} />
              <Card padding="none" className="overflow-hidden">
                <div className="flex justify-end p-4 pb-0">
                  <button
                    type="button"
                    onClick={() =>
                      exportCsv(
                        lowEngagement.map((r) => ({
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
                    <UrlCoverageDoughnut urlJoin={urlJoin} />
                    <div className="grid grid-cols-2 gap-3">
                      <SummaryCard
                        label={sp.urlJoin.matched}
                        value={urlJoin.matched}
                        sub={sp.urlJoin.matchedSub}
                      />
                      <SummaryCard
                        label={sp.urlJoin.crawlOnly}
                        value={urlJoin.crawl_only}
                        sub={sp.urlJoin.crawlOnlySub}
                      />
                      <SummaryCard
                        label={sp.urlJoin.gscOnly}
                        value={urlJoin.gsc_only}
                        sub={sp.urlJoin.gscOnlySub}
                      />
                      <SummaryCard
                        label={sp.urlJoin.ga4Only}
                        value={urlJoin.ga4_only}
                        sub={sp.urlJoin.ga4OnlySub}
                      />
                    </div>
                  </div>
                  {urlJoin.lists?.ga4_only?.length > 0 || urlJoin.lists?.crawl_only?.length > 0 ? (
                    <UrlGapListsPanel
                      urlJoin={urlJoin}
                      searchParams={searchParams}
                      showGa4
                      showCrawl
                      showGsc={false}
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
