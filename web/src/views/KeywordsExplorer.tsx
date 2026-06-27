
import { useState, useMemo, useEffect, useCallback } from 'react';
import type { KeywordRow, KeywordReportData, ViewProps } from '@/types';
import type { CannibalisationItem, KeywordHistoryMap, QueryPageMisalignmentItem } from '@/types/components';
import { Key, Settings2, Play, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { useTabSections } from '@/hooks/useTabSections';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { KEYWORDS_EXPLORER_TAB_SECTIONS } from '@/lib/reportViewSections';
import { useOptionalPipeline } from '../context/PipelineContext';
import { useKeywordBrandQuery } from '@/hooks/useKeywordBrandQuery';
import { filterKeywordRowsForDomain } from '@/lib/filterKeywordsForDomain';
import { apiUrl, apiFetch } from '../lib/publicBase';
import { goToPipeline } from '../lib/pipelineReturn';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Button, ViewTabs } from '../components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import { filterBySearch } from '../components/google/tableUtils';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults';
import { buildKeywordColumns } from '../components/keywordsExplorer/KeywordTableColumns';
import {
  deriveBrandFromUrl,
  exportKeywordCsv,
  buildIntentCounts,
  buildSourceCounts,
} from '../components/keywordsExplorer/keywordTableUtils';
import {
  CannibalisationPanel,
  QueryPageMisalignmentPanel,
  ByPagePanel,
  BulkSeedPanel,
} from '../components/keywordsExplorer/KeywordPanels';
import TopicMapPanel from '../components/keywordsExplorer/TopicMapPanel';
import ContentTemplatesPanel from '../components/keywordsExplorer/ContentTemplatesPanel';
import CompetitorKeywordImport from '../components/keywordsExplorer/CompetitorKeywordImport';
import CompetitorKeywordGapPanel from '../components/keywordsExplorer/CompetitorKeywordGapPanel';
import KeywordOverviewPanel from '../components/keywordsExplorer/KeywordOverviewPanel';
import KeywordTabBanner from '../components/keywordsExplorer/KeywordTabBanner';
import KeywordFiltersBar from '../components/keywordsExplorer/KeywordFiltersBar';
import KeywordEmptyState from '../components/keywordsExplorer/KeywordEmptyState';
import KeywordExplorerChrome from '../components/keywordsExplorer/KeywordExplorerChrome';
import {
  type KeywordTabId,
  type KeywordTableTabId,
  KEYWORD_TABLE_TAB_IDS,
  tabRowCount,
  defaultSortForTab,
  baseRowsForTab,
  isTableTab,
} from '../components/keywordsExplorer/keywordTabMeta';

const KEYWORD_TABS = ['overview', ...KEYWORD_TABLE_TAB_IDS, 'cannib', 'alignment', 'bypage', 'topics', 'templates', 'competitor'] as const;

const EMPTY_ROWS: KeywordRow[] = [];
const EMPTY_HISTORY: KeywordHistoryMap = {};

export default function KeywordsExplorer({ onOpenIntegrations }: ViewProps) {
  const navigate = useNavigate();
  const { data, startUrlByRunId, selectedReportId, loadReport } = useReport();
  useSectionData('keywords');
  const keywordsReady = useSectionsViewReady(['keywords']);
  const pipeline = useOptionalPipeline();
  const propertyId = Number(pipeline?.configState.active_property_id || 0);
  const ke = strings.views.keywordsExplorer;
  const brandQuery = useKeywordBrandQuery();
  const kwData: KeywordReportData | undefined = data?.keywords;
  const rawRows: KeywordRow[] = Array.isArray(kwData?.rows) ? kwData.rows : EMPTY_ROWS;
  const rows = useMemo(
    () => filterKeywordRowsForDomain(rawRows, brandQuery),
    [rawRows, brandQuery],
  );

  const startUrl =
    (selectedReportId != null ? startUrlByRunId.get(selectedReportId) : undefined) ||
    data?.google?.gsc?.site_url ||
    '';
  const brandName = String(kwData?.brand_name || deriveBrandFromUrl(startUrl) || '').trim();

  const [activeTab, setActiveTab] = useUrlTab(KEYWORD_TABS, 'overview');
  useTabSections(KEYWORDS_EXPLORER_TAB_SECTIONS, true);
  const [intentFilter, setIntentFilter] = useState('');
  const [brandedFilter, setBrandedFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [brandScopedExpansion, setBrandScopedExpansion] = useState(true);
  const [showSeedExpander, setShowSeedExpander] = useState(false);
  const [historyByKeyword, setHistoryByKeyword] = useState<KeywordHistoryMap>({});

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
  const tabLabels = {
    ...(ke.tabs as Record<string, string>),
    topics: 'Topic map',
    templates: 'Content templates',
    competitor: 'Competitor keywords',
  } as Record<KeywordTabId, string>;

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
    () => baseRowsForTab('questions', rows, tabFilterOptions).length,
    [rows, tabFilterOptions],
  );
  const opportunityCount = useMemo(
    () => baseRowsForTab('opportunities', rows, tabFilterOptions).length,
    [rows, tabFilterOptions],
  );
  const strikingCount = useMemo(
    () => baseRowsForTab('striking', rows, tabFilterOptions).length,
    [rows, tabFilterOptions],
  );
  const cannibItems: CannibalisationItem[] = (kwData?.cannibalisation as CannibalisationItem[] | undefined) ?? [];
  const alignmentItems: QueryPageMisalignmentItem[] =
    (kwData?.query_page_misalignment as QueryPageMisalignmentItem[] | undefined) ??
    [];

  const tabCounts = useMemo(
    () => ({
      questions: questionCount,
      quickwins: quickWinCount,
      striking: strikingCount || Number(kwData?.striking_distance_count) || 0,
      lostclicks: lostClickCount,
      opportunities: opportunityCount,
      cannib: cannibItems.length,
      alignment: alignmentItems.length,
      pages: new Set(rows.map((r) => r.gsc_url).filter(Boolean)).size,
    }),
    [questionCount, quickWinCount, strikingCount, kwData?.striking_distance_count, lostClickCount, opportunityCount, cannibItems.length, alignmentItems.length, rows],
  );

  const hasActiveFilters = !!(searchQuery || intentFilter || brandedFilter || sourceFilter);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setIntentFilter('');
    setBrandedFilter('');
    setSourceFilter('');
  }, []);

  const filteredRows = useMemo(() => {
    let base: KeywordRow[];
    if (activeTab === 'overview' || !isTableTab(activeTab)) {
      base = rows;
    } else {
      base = baseRowsForTab(activeTab, rows, tabFilterOptions);
    }

    base = filterBySearch(base, searchQuery, 'keyword');
    if (intentFilter) base = base.filter((r) => r.intent === intentFilter);
    if (brandedFilter === 'branded') base = base.filter((r) => r.is_branded);
    if (brandedFilter === 'nonbranded') base = base.filter((r) => !r.is_branded);
    if (sourceFilter) base = base.filter((r) => (r.sources || []).includes(sourceFilter));

    return base;
  }, [rows, activeTab, tabFilterOptions, searchQuery, intentFilter, brandedFilter, sourceFilter]);

  const tableRows = useMemo(() => {
    if (!isTableTab(activeTab)) return [];
    return filteredRows;
  }, [activeTab, filteredRows]);

  const tabBaseCount = useMemo(() => {
    if (!isTableTab(activeTab)) return 0;
    return baseRowsForTab(activeTab, rows, tabFilterOptions).length;
  }, [activeTab, rows, tabFilterOptions]);

  const gscKeywordsForHistory = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
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
    apiFetch(apiUrl('/integrations/google/keywords/history/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: gscKeywordsForHistory,
        limit: 30,
        ...(brandQuery ? { domain: brandQuery } : {}),
      }),
    })
      .then((res) => res.json())
      .then((payload) => {
        if (!cancelled) setHistoryByKeyword((payload.histories || {}) as KeywordHistoryMap);
      })
      .catch(() => {
        if (!cancelled) setHistoryByKeyword(EMPTY_HISTORY);
      });
    return () => {
      cancelled = true;
    };
  }, [gscKeywordsForHistory, brandQuery]);

  const columns = useMemo(
    () => buildKeywordColumns(showParentTopic, showTrend, historyByKeyword, ke, rows),
    [showParentTopic, showTrend, historyByKeyword, ke, rows],
  );

  const insights = useMemo(() => {
    const bullets: string[] = [];
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

  const enrichedAtLabel = kwData?.fetched_at
    ? new Date(String(kwData.fetched_at)).toLocaleString()
    : null;

  const tabBadges = useMemo(() => {
    const badges: Partial<Record<KeywordTabId, number | null>> = {};
    for (const id of KEYWORD_TABS) {
      badges[id] = tabRowCount(id, rows, tabFilterOptions, tabCounts);
    }
    return badges;
  }, [rows, tabFilterOptions, tabCounts]);

  const showBrandScopeUi =
    brandName && ['questions', 'opportunities'].includes(activeTab);

  const bannerCount = useMemo(() => {
    if (activeTab === 'cannib') return cannibItems.length;
    if (activeTab === 'alignment') return alignmentItems.length;
    if (activeTab === 'bypage') return tabCounts.pages;
    if (isTableTab(activeTab)) return tableRows.length;
    return null;
  }, [activeTab, cannibItems.length, alignmentItems.length, tabCounts.pages, tableRows.length]);

  const navigateTab = useCallback((tab: KeywordTabId) => setActiveTab(tab), []);

  const tableEmptyContent = useMemo(() => {
    if (!isTableTab(activeTab) || tableRows.length > 0) return null;
    const te = ke.tabEmpty as Record<string, string> & {
      filteredTitle: string;
      filteredDescription: string;
      filteredHint: string;
    };
    if (hasActiveFilters && tabBaseCount > 0) {
      return (
        <KeywordEmptyState
          title={te.filteredTitle}
          description={te.filteredDescription}
          hint={te.filteredHint}
          action={{ label: ke.filters.clear, onClick: clearFilters }}
        />
      );
    }
    const tabKey = activeTab as KeywordTableTabId;
    return (
      <KeywordEmptyState
        title={ke.table.noData}
        description={te[tabKey] || te.all}
      />
    );
  }, [activeTab, tableRows.length, hasActiveFilters, tabBaseCount, ke, clearFilters]);

  const competitorGapRows = useMemo(
    () => (Array.isArray(data?.competitor_keyword_gap) ? data.competitor_keyword_gap : []),
    [data?.competitor_keyword_gap],
  );

  const topicClusters = useMemo(
    () => (data?.semantic_keyword_clusters as Array<{ topic?: string; keywords?: string[]; size?: number }>) || [],
    [data?.semantic_keyword_clusters],
  );

  const topQuickWinsPreview = useMemo(
    () =>
      [...rows]
        .filter((r) => {
          const pos = parseFloat(String(r.gsc_position ?? 0));
          return pos >= 4 && pos <= 20 && (r.opportunity_clicks || 0) > 5;
        })
        .sort((a, b) => (b.opportunity_clicks || 0) - (a.opportunity_clicks || 0))
        .slice(0, 5),
    [rows],
  );

  const topOpportunitiesPreview = useMemo(
    () =>
      [...rows]
        .filter((r) => !r.gsc_position && (r.sources || []).length > 0)
        .sort((a, b) => (b.traffic_potential || 0) - (a.traffic_potential || 0))
        .slice(0, 5),
    [rows],
  );

  const kpiDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.kpiSummary',
      brandName: brandName || null,
      totalKeywords: kwData?.total_keywords ?? rows.length,
      sourceCount,
      gscCount: kwData?.gsc_keyword_count ?? 0,
      quickWins: quickWinCount,
      cannib: cannibItems.length,
      lostClicks: lostClickCount,
      questions: questionCount,
    }),
    [
      brandName,
      cannibItems.length,
      kwData?.gsc_keyword_count,
      kwData?.total_keywords,
      lostClickCount,
      questionCount,
      quickWinCount,
      rows.length,
      sourceCount,
    ],
  );

  const exploreDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.overview.explore',
      counts: {
        total: rows.length,
        quickwins: quickWinCount,
        lostclicks: lostClickCount,
        questions: questionCount,
        opportunities: opportunityCount,
        cannib: cannibItems.length,
        pages: tabCounts.pages,
      },
    }),
    [
      cannibItems.length,
      lostClickCount,
      opportunityCount,
      questionCount,
      quickWinCount,
      rows.length,
      tabCounts.pages,
    ],
  );

  const intentDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.overview.intentMix',
      counts: buildIntentCounts(rows),
    }),
    [rows],
  );

  const sourceDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.overview.sourceMix',
      counts: buildSourceCounts(rows),
    }),
    [rows],
  );

  const topQuickWinsDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.overview.topQuickWins',
      rows: topQuickWinsPreview,
    }),
    [topQuickWinsPreview],
  );

  const topOpportunitiesDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.overview.topOpportunities',
      rows: topOpportunitiesPreview,
    }),
    [topOpportunitiesPreview],
  );

  const insightsDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.overview.insights',
      bullets: insights,
    }),
    [insights],
  );

  const tableTabDevData = useMemo(() => {
    if (!isTableTab(activeTab)) return undefined;
    return {
      widget: `keywordsExplorer.${activeTab}.table`,
      searchQuery: searchQuery || null,
      intentFilter: intentFilter || null,
      brandedFilter: brandedFilter || null,
      sourceFilter: sourceFilter || null,
      brandScoped: brandScopedExpansion,
      rowCount: tableRows.length,
      rows: tableRows,
    };
  }, [
    activeTab,
    brandScopedExpansion,
    brandedFilter,
    intentFilter,
    searchQuery,
    sourceFilter,
    tableRows,
  ]);

  const topicsDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.topics.map',
      clusters: topicClusters.slice(0, 24),
    }),
    [topicClusters],
  );

  const templatesDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.templates.panel',
      defaultKeyword: rows[0]?.keyword || '',
      clusterRows: rows.slice(0, 20),
    }),
    [rows],
  );

  const competitorImportDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.competitor.import',
      propertyId: propertyId || null,
    }),
    [propertyId],
  );

  const competitorGapDevData = useMemo(
    () => ({
      widget: 'keywordsExplorer.competitor.gap',
      rowCount: competitorGapRows.length,
      rows: competitorGapRows,
    }),
    [competitorGapRows],
  );

  if (!keywordsReady) {
    return <ViewSectionLoading title={ke.title} />;
  }

  if (!kwData || rows.length === 0) {
    return (
      <PageLayout className="space-y-6">
        <PageHeader
          icon={<Key className="h-7 w-7 text-link shrink-0" />}
          title={ke.title}
          subtitle={ke.subtitle}
        />
        <div className="max-w-md mx-auto text-center py-12">
          <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-bright mb-2">{ke.emptyTitle}</h2>
          <p className="text-muted-foreground text-sm mb-4 whitespace-pre-line">{ke.emptyBody}</p>
          <p className="text-xs text-muted-foreground mb-6">{ke.emptyHint}</p>
          <Button
            variant="primary"
            onClick={() => goToPipeline(navigate, { preset: 'keywords-explorer' })}
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
          <BulkSeedPanel brandQuery={brandQuery} />
        </div>
      </PageLayout>
    );
  }

  const keywordTabItems = KEYWORD_TABS.map((id) => ({
    id,
    label: tabLabels[id],
    badge: tabBadges[id] ?? null,
  }));

  return (
    <PageLayout className="space-y-6">
      <KeywordExplorerChrome
        title={ke.title}
        subtitle={ke.subtitle}
        enrichedAt={enrichedAtLabel}
        siteUrl={String(data?.google?.gsc?.site_url || startUrl || '').trim() || undefined}
        hasGscConnected={hasGscConnected}
        showSeedExpander={showSeedExpander}
        onToggleSeeds={() => setShowSeedExpander((v) => !v)}
        onExportCsv={() => exportKeywordCsv(tableRows.length ? tableRows : filteredRows)}
        onOpenIntegrations={onOpenIntegrations}
        activeTab={activeTab}
        onNavigateTab={navigateTab}
        kpis={{
          total: rows.length,
          totalDisplay: (kwData.total_keywords || rows.length).toLocaleString(),
          sourceCount,
          gscCount: kwData.gsc_keyword_count || 0,
          quickWins: quickWinCount,
          cannib: cannibItems.length,
          lostClicks: lostClickCount,
          questions: questionCount,
        }}
        kpiDevData={kpiDevData}
      />

      {showSeedExpander && <BulkSeedPanel brandQuery={brandQuery} />}

      {showBrandScopeUi && (
        <p className="text-xs rounded-lg px-3 py-2 mb-4 border border-accent/30 bg-accent/5 text-muted-foreground">
          {format(ke.brandScopeBanner, { brand: brandName })}
        </p>
      )}

      <ViewTabs
        tabs={keywordTabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as KeywordTabId)}
        ariaLabel={ke.title}
        idPrefix="kw"
      />

      {activeTab === 'overview' && (
        <KeywordOverviewPanel
          rows={rows}
          insights={insights}
          pageCount={tabCounts.pages}
          counts={{
            total: rows.length,
            quickwins: quickWinCount,
            lostclicks: lostClickCount,
            questions: questionCount,
            opportunities: opportunityCount,
            cannib: cannibItems.length,
          }}
          onNavigate={navigateTab}
          exploreDevData={exploreDevData}
          intentDevData={intentDevData}
          sourceDevData={sourceDevData}
          topQuickWinsDevData={topQuickWinsDevData}
          topOpportunitiesDevData={topOpportunitiesDevData}
          insightsDevData={insightsDevData}
        />
      )}

      {activeTab !== 'overview' && (
        <div id={`kw-tab-${activeTab}`} role="tabpanel" className="mb-6">
        <Card padding="none" className="overflow-hidden" devData={tableTabDevData}>
          <KeywordTabBanner tab={activeTab} count={bannerCount} />

          {isTableTab(activeTab) && (
            <KeywordFiltersBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              intentFilter={intentFilter}
              onIntentChange={setIntentFilter}
              brandedFilter={brandedFilter}
              onBrandedChange={setBrandedFilter}
              sourceFilter={sourceFilter}
              onSourceChange={setSourceFilter}
              resultCount={tableRows.length}
              showBrandScope={!!showBrandScopeUi}
              brandScoped={brandScopedExpansion}
              onBrandScopedChange={setBrandScopedExpansion}
            />
          )}

          {activeTab === 'cannib' ? (
            <CannibalisationPanel items={cannibItems} />
          ) : activeTab === 'alignment' ? (
            <QueryPageMisalignmentPanel items={alignmentItems} />
          ) : activeTab === 'bypage' ? (
            <ByPagePanel rows={rows} ke={ke} brandQuery={brandQuery} />
          ) : activeTab === 'topics' ? (
            <TopicMapPanel
              clusters={topicClusters}
              emptyLabel="Run a report with LLM keyword clusters enabled to see topic groups."
              devData={topicsDevData}
            />
          ) : activeTab === 'templates' ? (
            <ContentTemplatesPanel
              defaultKeyword={rows[0]?.keyword || ''}
              clusterRows={rows.slice(0, 20)}
              devData={templatesDevData}
            />
          ) : activeTab === 'competitor' ? (
            <>
              <div className="relative group/dev-card">
                <DevCopyJsonButton data={competitorImportDevData} />
                <CompetitorKeywordImport
                  propertyId={propertyId}
                  onImported={() => void loadReport()}
                />
              </div>
              <CompetitorKeywordGapPanel rows={competitorGapRows} devData={competitorGapDevData} />
            </>
          ) : tableEmptyContent ? (
            tableEmptyContent
          ) : (
            <div className="p-4">
              <SortablePaginatedTable
                columns={columns}
                rows={tableRows}
                defaultSort={defaultSortForTab(activeTab)}
                rowKeyField="keyword"
                emptyMessage={ke.table.noData}
                paginationLabels={ke.table}
              />
            </div>
          )}
        </Card>
        </div>
      )}

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
