'use client';

import { useState, useMemo, useEffect } from 'react';
import type { KeywordRow, KeywordReportData, ViewProps } from '@/types';
import type { CannibalisationItem } from '@/types/components';
import { Key, Search, AlertCircle, Download, Settings2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useReport } from '../context/useReport';
import { apiUrl } from '../lib/publicBase';
import { goToPipeline } from '../lib/pipelineReturn';
import { strings, format } from '../lib/strings';
import { PageLayout, Card, Button } from '../components';
import SummaryCard from '../components/google/SummaryCard';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import { filterBySearch } from '../components/google/tableUtils';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults';
import { IntentMixChart, SourceMixChart } from '../components/keywordsExplorer/KeywordCharts';
import { buildKeywordColumns } from '../components/keywordsExplorer/KeywordTableColumns';
import {
  SOURCE_CONFIG,
  deriveBrandFromUrl,
  exportKeywordCsv,
  filterRowsByTab,
} from '../components/keywordsExplorer/keywordTableUtils';
import {
  CannibalisationPanel,
  ByPagePanel,
  BulkSeedPanel,
} from '../components/keywordsExplorer/KeywordPanels';

const TAB_IDS = ['overview', 'all', 'questions', 'quickwins', 'lostclicks', 'opportunities', 'cannib', 'bypage'] as const;
type KeywordTabId = (typeof TAB_IDS)[number];

const EMPTY_ROWS: KeywordRow[] = [];
const EMPTY_HISTORY: Record<string, unknown> = {};

export default function KeywordsExplorer({ onOpenIntegrations }: ViewProps) {
  const router = useRouter();
  const { data, startUrlByRunId, selectedReportId } = useReport();
  const ke = strings.views.keywordsExplorer;
  const kwData: KeywordReportData | undefined = data?.keywords;
  const rows: KeywordRow[] = Array.isArray(kwData?.rows) ? kwData.rows : EMPTY_ROWS;

  const startUrl =
    (selectedReportId != null ? startUrlByRunId.get(selectedReportId) : undefined) ||
    data?.google?.gsc?.site_url ||
    '';
  const brandName = String(kwData?.brand_name || deriveBrandFromUrl(startUrl) || '').trim();

  const [activeTab, setActiveTab] = useState<KeywordTabId>('overview');
  const [intentFilter, setIntentFilter] = useState('');
  const [brandedFilter, setBrandedFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [brandScopedExpansion, setBrandScopedExpansion] = useState(true);
  const [showSeedExpander, setShowSeedExpander] = useState(false);
  const [historyByKeyword, setHistoryByKeyword] = useState({});

  const tabFilterOptions = useMemo(
    () => ({ brandName, brandScoped: brandScopedExpansion }),
    [brandName, brandScopedExpansion],
  );

  useEffect(() => {
    syncChartJsDefaultsColor();
  }, []);

  const hasGscConnected = !!data?.google?.gsc;
  const showParentTopic = rows.some((r) => r.parent_topic);
  const showTrend = rows.some((r) => r.trend);
  const tabLabels = ke.tabs as Record<KeywordTabId, string>;

  const quickWinCount = useMemo(
    () =>
      rows.filter((r) => {
        const pos = parseFloat(String(r.gsc_position ?? 0));
        return pos >= 4 && pos <= 20 && (r.opportunity_clicks || 0) > 5;
      }).length,
    [rows],
  );
  const lostClickCount = useMemo(() => rows.filter((r) => r.lost_clicks).length, [rows]);
  const questionCount = useMemo(
    () => filterRowsByTab(rows, 'questions', tabFilterOptions).length,
    [rows, tabFilterOptions],
  );
  const opportunityCount = useMemo(
    () => filterRowsByTab(rows, 'opportunities', tabFilterOptions).length,
    [rows, tabFilterOptions],
  );
  const cannibItems: CannibalisationItem[] = (kwData?.cannibalisation as CannibalisationItem[] | undefined) ?? [];

  const filteredRows = useMemo(() => {
    let base =
      activeTab === 'overview' || activeTab === 'all'
        ? rows
        : filterRowsByTab(rows, activeTab, tabFilterOptions);

    base = filterBySearch(base, searchQuery, 'keyword');
    if (intentFilter) base = base.filter((r) => r.intent === intentFilter);
    if (brandedFilter === 'branded') base = base.filter((r) => r.is_branded);
    if (brandedFilter === 'nonbranded') base = base.filter((r) => !r.is_branded);
    if (sourceFilter) base = base.filter((r) => (r.sources || []).includes(sourceFilter));

    return base;
  }, [rows, activeTab, tabFilterOptions, searchQuery, intentFilter, brandedFilter, sourceFilter]);

  const tableRows = useMemo(() => {
    if (['overview', 'cannib', 'bypage'].includes(activeTab)) return [];
    return filteredRows;
  }, [activeTab, filteredRows]);

  const gscKeywordsForHistory = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const r of tableRows) {
      if (r.gsc_position == null) continue;
      const kw = String(r.keyword || '').trim();
      if (!kw || seen.has(kw)) continue;
      seen.add(kw);
      list.push(kw);
      if (list.length >= 100) break;
    }
    return list;
  }, [tableRows]);

  useEffect(() => {
    if (!gscKeywordsForHistory.length) {
      setHistoryByKeyword((prev) => (Object.keys(prev).length === 0 ? prev : EMPTY_HISTORY));
      return undefined;
    }
    let cancelled = false;
    fetch(apiUrl('/integrations/google/keywords/history/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: gscKeywordsForHistory, limit: 30 }),
    })
      .then((res) => res.json())
      .then((payload) => {
        if (!cancelled) setHistoryByKeyword(payload.histories || {});
      })
      .catch(() => {
        if (!cancelled) setHistoryByKeyword(EMPTY_HISTORY);
      });
    return () => {
      cancelled = true;
    };
  }, [gscKeywordsForHistory]);

  const columns = useMemo(
    () => buildKeywordColumns(showParentTopic, showTrend, historyByKeyword, ke),
    [showParentTopic, showTrend, historyByKeyword, ke],
  );

  const paginationLabels = ke.table;

  const insights = useMemo(() => {
    const bullets = [];
    const topOpp = [...rows]
      .filter((r) => (r.opportunity_clicks || 0) > 0)
      .sort((a, b) => (b.opportunity_clicks || 0) - (a.opportunity_clicks || 0))[0];
    if (topOpp?.keyword) {
      bullets.push(
        format(ke.insights.topOpportunity, {
          keyword: topOpp.keyword,
          clicks: (topOpp.opportunity_clicks || 0).toLocaleString(),
        }),
      );
    }
    if (quickWinCount > 0) bullets.push(format(ke.insights.quickWins, { count: quickWinCount }));
    if (lostClickCount > 0) bullets.push(format(ke.insights.lostClicks, { count: lostClickCount }));
    if (cannibItems.length > 0) bullets.push(format(ke.insights.cannib, { count: cannibItems.length }));
    if (!hasGscConnected) bullets.push(ke.insights.noGsc);
    return bullets;
  }, [rows, quickWinCount, lostClickCount, cannibItems.length, hasGscConnected, ke]);

  const sourceCount = useMemo(
    () => new Set(rows.flatMap((r) => r.sources || [])).size,
    [rows],
  );

  const headerMeta = kwData?.fetched_at ? (
    <span>
      {' '}
      &middot; {format(ke.subtitleWithDate, { date: new Date(String(kwData.fetched_at)).toLocaleString() })}
    </span>
  ) : null;

  const tabBadges: Partial<Record<KeywordTabId, number | null>> = {
    questions: questionCount || null,
    quickwins: quickWinCount || null,
    lostclicks: lostClickCount || null,
    opportunities: opportunityCount || null,
    cannib: cannibItems.length || null,
  };

  const showBrandScopeUi =
    brandName && ['questions', 'opportunities'].includes(activeTab);

  const showFilters = !['cannib', 'bypage', 'overview'].includes(activeTab);
  const defaultSort =
    activeTab === 'quickwins' ? 'opportunity_clicks' : activeTab === 'lostclicks' ? 'lost_clicks' : 'traffic_potential';

  if (!kwData || rows.length === 0) {
    return (
      <PageLayout>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-bright mb-2 flex items-center gap-2">
            <Key className="h-7 w-7 text-link shrink-0" />
            {ke.title}
          </h1>
          <p className="text-muted-foreground">{ke.subtitle}</p>
        </div>
        <div className="max-w-md mx-auto text-center py-12">
          <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-bright mb-2">{ke.emptyTitle}</h2>
          <p className="text-muted-foreground text-sm mb-4 whitespace-pre-line">{ke.emptyBody}</p>
          <p className="text-xs text-muted-foreground mb-6">{ke.emptyHint}</p>
          <Button
            variant="primary"
            onClick={() => goToPipeline(router.push, { preset: 'keywords-explorer' })}
          >
            <Play className="h-4 w-4" aria-hidden />
            {ke.runInPipeline}
          </Button>
        </div>
        {!hasGscConnected && onOpenIntegrations && (
          <Card className="max-w-lg mx-auto mt-6 text-center border-blue-500/30">
            <p className="text-sm text-muted-foreground mb-3">{ke.connectBanner}</p>
            <button
              type="button"
              onClick={onOpenIntegrations}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 inline-flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
              {ke.connectGoogle}
            </button>
          </Card>
        )}
        <div className="mt-8 max-w-3xl mx-auto">
          <BulkSeedPanel />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-bright mb-2 flex items-center gap-2">
            <Key className="h-7 w-7 text-link shrink-0" />
            {ke.title}
          </h1>
          <p className="text-muted-foreground">
            {ke.subtitle}
            {headerMeta}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!hasGscConnected && onOpenIntegrations && (
            <button
              type="button"
              onClick={onOpenIntegrations}
              className="px-3 py-1.5 text-xs border border-blue-500/50 text-link rounded-lg hover:bg-blue-500/10 flex items-center gap-1"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {ke.connectGoogle}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSeedExpander((v) => !v)}
            className={`px-3 py-1.5 text-xs border rounded-lg flex items-center gap-1 transition-colors ${
              showSeedExpander
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-default text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            {ke.expandSeeds}
          </button>
          <button
            type="button"
            onClick={() => exportKeywordCsv(tableRows.length ? tableRows : filteredRows)}
            className="px-3 py-1.5 text-xs bg-brand-800 border border-default rounded-lg text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            {ke.exportCsv}
          </button>
        </div>
      </div>

      <p
        className={`text-xs rounded-lg px-3 py-2 mb-6 border ${
          hasGscConnected
            ? 'text-muted-foreground border-emerald-500/30 bg-emerald-500/5'
            : 'text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/10'
        }`}
      >
        {hasGscConnected ? ke.gscBanner : ke.noGscBanner}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label={ke.kpi.total}
          value={(kwData.total_keywords || rows.length).toLocaleString()}
          sub={format(ke.kpi.totalSub, { n: sourceCount })}
        />
        <SummaryCard
          label={ke.kpi.gsc}
          value={(kwData.gsc_keyword_count || 0).toLocaleString()}
          sub={ke.kpi.gscSub}
        />
        <SummaryCard label={ke.kpi.quickWins} value={quickWinCount.toLocaleString()} sub={ke.kpi.quickWinsSub} />
        <SummaryCard label={ke.kpi.cannib} value={cannibItems.length.toLocaleString()} sub={ke.kpi.cannibSub} />
      </div>

      {!hasGscConnected && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3 text-sm mb-6">
          <AlertCircle className="w-4 h-4 text-link shrink-0" />
          <span className="text-foreground flex-1">{ke.connectBanner}</span>
          {onOpenIntegrations && (
            <button
              type="button"
              onClick={onOpenIntegrations}
              className="px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent/90 whitespace-nowrap flex items-center gap-1.5 shrink-0"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {ke.connectGoogle}
            </button>
          )}
        </div>
      )}

      {showSeedExpander && <BulkSeedPanel />}

      {showBrandScopeUi && (
        <p className="text-xs rounded-lg px-3 py-2 mb-4 border border-accent/30 bg-accent/5 text-muted-foreground">
          {format(ke.brandScopeBanner, { brand: brandName })}
        </p>
      )}

      <div className="border-b border-default mb-6" role="tablist" aria-label={ke.title}>
        <div className="flex gap-0 overflow-x-auto">
          {TAB_IDS.map((id) => {
            const badge = tabBadges[id as KeywordTabId];
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`kw-tab-${id}`}
                id={`kw-tab-btn-${id}`}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tabLabels[id as KeywordTabId]}
                {(badge ?? 0) > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
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
        <div id="kw-tab-overview" role="tabpanel" className="space-y-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <IntentMixChart rows={rows} />
            <SourceMixChart rows={rows} />
          </div>
          {insights.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-foreground mb-3">{ke.insights.title}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {insights.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-link shrink-0">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {showFilters && (
        <div className="flex flex-wrap gap-2 items-center mb-4">
          {showBrandScopeUi && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={brandScopedExpansion}
                onChange={(e) => setBrandScopedExpansion(e.target.checked)}
                className="rounded border-default"
              />
              {ke.brandScopeToggle}
            </label>
          )}
          <div className="flex items-center gap-1.5 bg-brand-800 border border-default rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={ke.filters.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none w-48 sm:w-56"
            />
          </div>
          <select
            value={intentFilter}
            onChange={(e) => setIntentFilter(e.target.value)}
            className="bg-brand-800 border border-default rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none cursor-pointer"
          >
            <option value="">{ke.filters.allIntents}</option>
            <option value="informational">Informational</option>
            <option value="commercial">Commercial</option>
            <option value="transactional">Transactional</option>
            <option value="navigational">Navigational</option>
          </select>
          <select
            value={brandedFilter}
            onChange={(e) => setBrandedFilter(e.target.value)}
            className="bg-brand-800 border border-default rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none cursor-pointer"
          >
            <option value="">{ke.filters.allBranded}</option>
            <option value="branded">{ke.filters.brandedOnly}</option>
            <option value="nonbranded">{ke.filters.nonBranded}</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-brand-800 border border-default rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none cursor-pointer"
          >
            <option value="">{ke.filters.allSources}</option>
            {Object.entries(SOURCE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          {(searchQuery || intentFilter || brandedFilter || sourceFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIntentFilter('');
                setBrandedFilter('');
                setSourceFilter('');
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {ke.filters.clear}
            </button>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {format(ke.filters.count, { count: tableRows.length })}
          </span>
        </div>
      )}

      <Card padding="none" className="overflow-hidden mb-6">
        {activeTab === 'cannib' ? (
          <CannibalisationPanel items={cannibItems} />
        ) : activeTab === 'bypage' ? (
          <ByPagePanel rows={rows} ke={ke} />
        ) : activeTab === 'overview' ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {format(ke.filters.count, { count: rows.length })} — use the tabs above to explore keyword lists.
          </div>
        ) : (
          <div className="p-4">
            <SortablePaginatedTable
              columns={columns}
              rows={tableRows}
              defaultSort={defaultSort}
              rowKeyField="keyword"
              emptyMessage={ke.table.noData}
              paginationLabels={paginationLabels}
            />
          </div>
        )}
      </Card>

      {kwData.fetched_at && (
        <p className="text-xs text-muted-foreground">
          {format(ke.footer.lastEnrichment, { date: new Date(String(kwData.fetched_at)).toLocaleString() })}
          {(kwData.suggest_count ?? 0) > 0 && format(ke.footer.suggestCount, { n: kwData.suggest_count })}
          {(kwData.cannibalisation_count ?? 0) > 0 && format(ke.footer.cannibCount, { n: kwData.cannibalisation_count })}
        </p>
      )}
    </PageLayout>
  );
}
