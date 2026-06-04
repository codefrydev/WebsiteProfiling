'use client';

import type { ReactNode } from 'react';
import { useState, useMemo, useEffect } from 'react';
import type { GscPageRow, UrlJoinData } from '@/types';
import type { TableColumn } from '@/types/components';
import { TrendingUp, Search, AlertCircle, Settings2, Download } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, Card } from '../components';
import SummaryCard from '../components/google/SummaryCard';
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
} from '../components/searchPerformance/gscTableUtils';
import UrlGapListsPanel from '../components/google/UrlGapListsPanel';
import { buildLinksInspectHref } from '../lib/reportNav';
import { useSearchParams } from 'next/navigation';

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
  const sp = strings.views.searchPerformance;
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<GscTabId>('overview');
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
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'impressions',
        label: sp.table.impressions,
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'ctr',
        label: sp.table.ctr,
        render: (v) => <span className="tabular-nums">{v != null ? `${v}%` : '—'}</span>,
      },
      {
        key: 'position',
        label: sp.table.position,
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
            className="text-link hover:underline font-mono text-xs truncate block min-w-0 max-w-none"
          >
            {String(v ?? '')}
          </a>
        ),
      },
      {
        key: 'clicks',
        label: sp.table.clicks,
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'impressions',
        label: sp.table.impressions,
        render: (v) => <span className="tabular-nums">{Number(v ?? 0).toLocaleString()}</span>,
      },
      {
        key: 'ctr',
        label: sp.table.ctr,
        render: (v) => <span className="tabular-nums">{v != null ? `${v}%` : '—'}</span>,
      },
      {
        key: 'position',
        label: sp.table.position,
        render: (v) => <PositionBadge pos={v as number | string | null} />,
      },
      {
        key: '_inspect',
        label: '',
        render: (_v, row) => (
          <a
            href={buildLinksInspectHref(String((row as GscPageRow).page ?? ''), searchParams)}
            className="text-xs text-link hover:underline whitespace-nowrap"
          >
            {strings.components?.urlGapLists?.openInLinks || 'Link Explorer'}
          </a>
        ),
      },
    ],
    [sp, searchParams],
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

  const headerMeta: ReactNode = google?.fetched_at ? (
    <span>
      {' '}
      &middot; {format(sp.fetchedAt, { date: new Date(String(google.fetched_at)).toLocaleDateString() })}
    </span>
  ) : null;

  if (!google) {
    return (
      <PageLayout>
        <div className="max-w-md mx-auto text-center py-16">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-bright mb-2">{sp.emptyTitle}</h2>
          <p className="text-muted-foreground text-sm mb-6">{sp.emptyBody}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            {sp.emptyIntegrationsHint}
          </p>
        </div>
      </PageLayout>
    );
  }

  const errors = (google.errors || []).filter((e: string) => {
    if (e.startsWith('GSC:') && gsc?.summary) return false;
    if (e.startsWith('GA4:') && google.ga4?.summary) return false;
    return true;
  });

  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bright mb-2 flex items-center gap-2">
          <TrendingUp className="h-7 w-7 text-link shrink-0" />
          {sp.title}
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
            {errors.map((e: string, i: number) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </div>
      )}

      {gsc?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            label={sp.kpi.clicks}
            value={gsc.summary.clicks?.toLocaleString()}
          />
          <SummaryCard
            label={sp.kpi.impressions}
            value={gsc.summary.impressions?.toLocaleString()}
          />
          <SummaryCard
            label={sp.kpi.ctr}
            value={gsc.summary.ctr != null ? `${gsc.summary.ctr}%` : null}
          />
          <SummaryCard label={sp.kpi.position} value={gsc.summary.position} />
        </div>
      )}

      {!gsc ? (
        <p className="text-sm text-muted-foreground">{sp.emptyBody}</p>
      ) : (
        <>
          <div className="border-b border-default mb-6" role="tablist" aria-label={sp.title}>
            <div className="flex gap-0 overflow-x-auto">
              {TABS.map((id) => {
                let badge = null;
                if (id === 'opportunities') badge = opportunities.length || null;
                if (id === 'coverage') badge = coverageBadge;
                if (id === 'queries') badge = filteredQueries.length || null;
                if (id === 'pages') badge = filteredPages.length || null;
                const label = tabLabels[id as GscTabId];
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    aria-controls={`gsc-tab-${id}`}
                    id={`gsc-tab-btn-${id}`}
                    onClick={() => setActiveTab(id)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === id
                        ? 'border-accent text-accent'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                    {(badge ?? 0) > 0 && id !== 'queries' && id !== 'pages' && (
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
            <div id="gsc-tab-overview" role="tabpanel" aria-labelledby="gsc-tab-btn-overview" className="space-y-6">
              {(gsc.daily?.length ?? 0) > 0 && (
                <GscDailyTrendChart daily={gsc.daily ?? []} />
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopQueriesBarChart queries={gsc.top_queries ?? []} />
                <PositionDistributionChart queries={gsc.top_queries ?? []} />
              </div>
              {urlJoin && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <UrlCoverageDoughnut urlJoin={urlJoin} />
                  <div className="bg-brand-800 border border-default rounded-xl p-4">
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
                <div className="bg-brand-800 border border-default rounded-xl p-4">
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
              <TopQueriesBarChart queries={gsc.top_queries ?? []} />
              <Card padding="none" className="overflow-hidden">
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
              <TopPagesBarChart pages={gsc.top_pages ?? []} />
              <Card padding="none" className="overflow-hidden">
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
              <CtrOpportunityScatter rows={opportunities} />
              <Card padding="none" className="overflow-hidden">
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
                  {(urlJoin.lists?.gsc_only?.length ?? 0) > 0 || (urlJoin.lists?.crawl_only?.length ?? 0) > 0 ? (
                    <UrlGapListsPanel
                      urlJoin={urlJoin}
                      searchParams={searchParams}
                      showGsc
                      showCrawl
                      showGa4={false}
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
