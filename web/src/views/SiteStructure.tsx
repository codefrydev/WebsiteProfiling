import { useMemo, useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useUrlTab } from '@/hooks/useUrlTab';
import {
  FolderTree,
  Layers,
  Link2,
  AlignLeft,
  Timer,
  Gauge,
  ChevronsDownUp,
  ChevronsUpDown,
  BarChart3,
  Share2,
} from 'lucide-react';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useTabSections } from '@/hooks/useTabSections';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { SITE_STRUCTURE_TAB_SECTIONS, shouldBlockViewForSections } from '@/lib/reportViewSections';
import { strings, format } from '../lib/strings';
import { canonicalDomainFromPayload } from '../lib/domainSlug';
import {
  aggregateLinksByPath,
  mergeWithBaseline,
  buildPathTree,
  flattenTreeForTable,
  defaultExpandedPathKeys,
  filterLinksBySearch,
  finalizeRollup,
  linkMatchesPathKey,
} from '../lib/siteStructureTree';
import { PageLayout, PageHeader, Card, Button, StatCard, AlertBanner, ViewTabs, ViewTabPanel } from '../components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import { metricHelpHint } from '@/lib/metricHelp';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import type { ViewTabItem } from '../components';
import PathTreeTable from '../components/siteStructure/PathTreeTable';
import CrawlMapPanel from '../components/siteStructure/CrawlMapPanel';

const SiteStructureLinkGraph = lazy(() => import('../components/siteStructure/SiteStructureLinkGraph'));

import type { CrawlSegmentEntry, CrawlSegmentsData, PathTreeNode, PathTreeTableRow, ViewProps } from '@/types';

const TREE_PAGE_SIZE = 20;

const SITE_STRUCTURE_TABS = ['overview', 'tree', 'map', 'graph'] as const;
type SiteStructureTabId = (typeof SITE_STRUCTURE_TABS)[number];

interface SiteStructureTreePanelProps {
  merged: Map<string, { current: ReturnType<typeof finalizeRollup>; baseline: ReturnType<typeof finalizeRollup> | null }>;
  tree: PathTreeNode;
  hasCompare: boolean;
  showCompareCharts: boolean;
  onToggleCharts: () => void;
  s: (typeof strings.views)['siteStructure'];
  filteredLinksLength: number;
  dataLinksLength: number;
}

function SiteStructureTreePanel({
  merged,
  tree,
  hasCompare,
  showCompareCharts,
  onToggleCharts,
  s,
  filteredLinksLength,
  dataLinksLength,
}: SiteStructureTreePanelProps) {
  const [expanded, setExpanded] = useState(() =>
    !merged.size ? new Set(['/']) : defaultExpandedPathKeys([...merged.keys()], 2)
  );
  const [page, setPage] = useState(1);
  const paginationLabels = strings.views.links;

  const visibleRows = useMemo((): PathTreeTableRow[] => {
    const out: PathTreeTableRow[] = [];
    flattenTreeForTable(tree, expanded, 0, out);
    return out;
  }, [tree, expanded]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / TREE_PAGE_SIZE));
  const pageRows = visibleRows.slice((page - 1) * TREE_PAGE_SIZE, page * TREE_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [visibleRows.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const togglePath = useCallback((pathKey: string) => {
    setPage(1);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!merged.size) return;
    setPage(1);
    setExpanded(new Set([...merged.keys()]));
  }, [merged]);

  const collapseToDefault = useCallback(() => {
    if (!merged.size) {
      setExpanded(new Set(['/']));
      setPage(1);
      return;
    }
    setPage(1);
    setExpanded(defaultExpandedPathKeys([...merged.keys()], 2));
  }, [merged]);

  const jumpToSection = useCallback((pathKey: string) => {
    setPage(1);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add('/');
      next.add(pathKey);
      return next;
    });
  }, []);

  const topSections = tree.children ?? [];

  const treePanelDevData = useMemo(
    () => ({
      widget: 'siteStructure.tree',
      visibleRowCount: visibleRows.length,
      totalPrefixCount: merged.size,
      page,
      totalPages,
      expanded: [...expanded],
      hasCompare,
      showCompareCharts,
      pageRows,
      topSections: topSections.map((node) => ({
        pathKey: node.pathKey,
        segment: node.segment,
        pages: node.current?.pages ?? 0,
      })),
    }),
    [
      expanded,
      hasCompare,
      merged.size,
      page,
      pageRows,
      showCompareCharts,
      topSections,
      totalPages,
      visibleRows.length,
    ],
  );

  if (visibleRows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-12 text-center">
        {filteredLinksLength === 0 && dataLinksLength > 0 ? s.emptyFilter : s.empty}
      </p>
    );
  }

  return (
    <div className="relative group/dev-card">
      <DevCopyJsonButton data={treePanelDevData} />
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 px-4 py-3 border-b border-muted bg-brand-900/40">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{s.treeTitle}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(s.treeShowing, { count: visibleRows.length, total: merged.size })}
          </p>
          <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{s.treeHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button type="button" variant="secondary" className="text-xs gap-1.5" onClick={expandAll}>
            <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
            {s.expandAll}
          </Button>
          <Button type="button" variant="secondary" className="text-xs gap-1.5" onClick={collapseToDefault}>
            <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
            {s.collapseDefault}
          </Button>
          {hasCompare ? (
            <Button
              type="button"
              variant={showCompareCharts ? 'secondary' : 'primary'}
              className="text-xs gap-1.5"
              onClick={onToggleCharts}
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
              {showCompareCharts ? s.toggleChartsHide : s.toggleChartsShow}
            </Button>
          ) : null}
        </div>
      </div>

      {hasCompare && showCompareCharts ? (
        <div className="px-4 py-2 border-b border-muted bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300/90">
          {s.changeLegend}
        </div>
      ) : null}

      {topSections.length > 1 ? (
        <div className="px-4 py-3 border-b border-muted">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">{s.quickJump}</p>
          <div className="flex flex-wrap gap-2">
            {topSections.slice(0, 12).map((node) => (
              <button
                key={node.pathKey}
                type="button"
                onClick={() => jumpToSection(node.pathKey)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-brand-900/50 px-2.5 py-1.5 text-xs font-mono text-foreground hover:bg-brand-700 hover:border-muted transition-colors"
                title={node.pathKey}
              >
                <span className="truncate max-w-[8rem]">{node.segment}</span>
                <span className="shrink-0 rounded bg-brand-800 px-1 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {node.current.pages}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground px-4 py-2 border-b border-muted bg-brand-900/30 sm:hidden">
        {strings.common.tableSwipeHint}
      </p>

      <PathTreeTable
        rows={pageRows}
        expanded={expanded}
        onToggle={togglePath}
        hasCompare={hasCompare}
        showCompareCharts={showCompareCharts}
        s={s}
      />

      {totalPages > 1 ? (
        <div className="p-4 border-t border-muted bg-brand-900 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <div className="text-sm text-muted-foreground">
            {paginationLabels.pageOf}{' '}
            <span className="font-bold text-bright">{page}</span> {paginationLabels.of}{' '}
            <span className="font-bold text-bright">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-foreground text-xs"
            >
              {paginationLabels.previous}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-foreground text-xs"
            >
              {paginationLabels.next}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function fmtMetric(n: unknown): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString();
}

export default function SiteStructure({ searchQuery = '' }: ViewProps) {
  const s = strings.views.siteStructure;
  const { data, compareData, startUrlByRunId, selectedReportId, compareReportId, sectionStatus } = useReport();
  useSectionData('links');
  useSectionData('structure');
  const [showCompareCharts, setShowCompareCharts] = useState(true);
  const [pathPrefixFilter, setPathPrefixFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useUrlTab(SITE_STRUCTURE_TABS, 'overview');
  useTabSections(SITE_STRUCTURE_TAB_SECTIONS[activeTab] ?? ['structure'], true);

  const expectedHost = useMemo(
    () => canonicalDomainFromPayload(data, startUrlByRunId),
    [data, startUrlByRunId]
  );

  const filteredLinks = useMemo(() => {
    let links = filterLinksBySearch(data?.links || [], searchQuery);
    if (pathPrefixFilter) {
      links = links.filter((l) => linkMatchesPathKey(String(l.url || ''), pathPrefixFilter, expectedHost));
    }
    return links;
  }, [data?.links, searchQuery, pathPrefixFilter, expectedHost]);

  const baselineLinks = useMemo(() => {
    let links = filterLinksBySearch(compareData?.links || [], searchQuery);
    if (pathPrefixFilter) {
      links = links.filter((l) => linkMatchesPathKey(String(l.url || ''), pathPrefixFilter, expectedHost));
    }
    return links;
  }, [compareData?.links, searchQuery, pathPrefixFilter, expectedHost]);

  const hasCompare = compareData != null && compareReportId != null;
  const searchActive = (searchQuery || '').trim().length > 0;

  const { merged, tree } = useMemo(() => {
    const curMap = aggregateLinksByPath(filteredLinks, expectedHost);
    const baseMap = hasCompare ? aggregateLinksByPath(baselineLinks, expectedHost) : new Map();
    const mergedMap = hasCompare ? mergeWithBaseline(curMap, baseMap) : new Map();
    if (!hasCompare) {
      for (const [k, roll] of curMap) {
        mergedMap.set(k, { current: finalizeRollup(roll), baseline: null });
      }
    }
    const t = buildPathTree(mergedMap);
    return { merged: mergedMap, tree: t };
  }, [filteredLinks, baselineLinks, expectedHost, hasCompare]);

  const rootMetrics = merged.get('/')?.current;

  const crawlSegments = (data?.crawl_segments as CrawlSegmentsData | undefined) ?? null;

  const topLinksByInlinks = useMemo(
    () =>
      [...filteredLinks]
        .sort((a, b) => Number(b.inlinks || 0) - Number(a.inlinks || 0))
        .slice(0, 10),
    [filteredLinks],
  );

  const panelKey = [
    selectedReportId ?? '',
    compareReportId ?? '',
    searchQuery,
    String(filteredLinks.length),
    String(baselineLinks.length),
    expectedHost,
  ].join('|');

  const subtitle = hasCompare ? `${s.subtitle} ${s.subtitleCompareHint}` : s.subtitle;

  const tabItems = useMemo((): ViewTabItem[] => {
    const prefixCount = merged.size;
    return [
      {
        id: 'overview',
        label: s.tabs.overview,
        icon: <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: prefixCount > 0 ? prefixCount : null,
      },
      {
        id: 'tree',
        label: s.tabs.tree,
        icon: <FolderTree className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: filteredLinks.length > 0 ? filteredLinks.length : null,
      },
      {
        id: 'map',
        label: 'Crawl map',
        icon: <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: null,
      },
      {
        id: 'graph',
        label: 'Link graph',
        icon: <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: (data?.graph_nodes?.length ?? 0) > 0 ? Math.min(200, data!.graph_nodes!.length) : null,
      },
    ];
  }, [s.tabs, merged.size, filteredLinks.length, data?.graph_nodes?.length]);

  const overviewStatsDevData = useMemo(
    () => ({
      widget: 'siteStructure.overview.stats',
      urls: rootMetrics?.pages ?? filteredLinks.length,
      pathPrefixes: merged.size,
      totalInlinks: rootMetrics?.inlinks ?? null,
      avgWords: rootMetrics?.avgWordCount ?? null,
      avgResponseMs: rootMetrics?.avgResponseMs ?? null,
      avgPerfScore: rootMetrics?.avgPerfScore ?? null,
      filteredLinkCount: filteredLinks.length,
      searchActive,
      pathPrefixFilter,
    }),
    [
      filteredLinks.length,
      merged.size,
      pathPrefixFilter,
      rootMetrics,
      searchActive,
    ],
  );

  const crawlSegmentsDevData = useMemo(
    () => ({
      widget: 'siteStructure.overview.crawlSegments',
      overallHealth: crawlSegments?.overall_health ?? null,
      segments: crawlSegments?.segments ?? [],
    }),
    [crawlSegments],
  );

  const topInlinksDevData = useMemo(
    () => ({
      widget: 'siteStructure.overview.topInlinks',
      links: topLinksByInlinks.map((link) => ({
        url: link.url,
        inlinks: Number(link.inlinks || 0),
        status: link.status ?? null,
      })),
    }),
    [topLinksByInlinks],
  );

  const mapDevData = useMemo(
    () => ({
      widget: 'siteStructure.map',
      pathPrefixFilter,
      crawlSegments: crawlSegments?.segments ?? [],
      treeRoot: {
        pathKey: tree?.pathKey ?? '/',
        segment: tree?.segment ?? '/',
        pages: tree?.current?.pages ?? 0,
        childCount: tree?.children?.length ?? 0,
      },
    }),
    [crawlSegments?.segments, pathPrefixFilter, tree],
  );

  const primarySections = activeTab === 'overview' ? (['links'] as const) : (['structure'] as const);
  if (shouldBlockViewForSections(primarySections, sectionStatus, data)) {
    return <ViewSectionLoading title={s.title} />;
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        icon={<FolderTree className="h-7 w-7 text-link shrink-0" />}
        title={s.title}
        subtitle={subtitle}
      />

      <ViewTabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as SiteStructureTabId)}
        ariaLabel={s.title}
        idPrefix="site-structure"
      />

      {activeTab === 'overview' && (
        <ViewTabPanel idPrefix="site-structure" tabId="overview" className="space-y-6">
          {searchActive ? (
            <AlertBanner variant="info" className="text-xs py-2">
              {s.searchFilterBanner}
            </AlertBanner>
          ) : (
            <AlertBanner variant="info" className="text-xs py-2">
              {s.metricsDisclaimer}
            </AlertBanner>
          )}

          {tree ? (
            <div className="relative group/dev-card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <DevCopyJsonButton data={overviewStatsDevData} />
              <StatCard
                label={s.stats.urls}
                value={fmtMetric(rootMetrics?.pages ?? filteredLinks.length)}
                icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
                hint={metricHelpHint('views.siteStructure.urlsInView')}
              />
              <StatCard
                label={s.stats.pathPrefixes}
                value={fmtMetric(merged.size)}
                icon={<FolderTree className="h-3.5 w-3.5" aria-hidden />}
                hint={metricHelpHint('views.siteStructure.pathPrefixes')}
              />
              <StatCard
                label={s.stats.totalInlinks}
                value={fmtMetric(rootMetrics?.inlinks)}
                icon={<Link2 className="h-3.5 w-3.5" aria-hidden />}
                hint={metricHelpHint('views.siteStructure.totalInlinks')}
              />
              <StatCard
                label={s.stats.avgWords}
                value={fmtMetric(rootMetrics?.avgWordCount)}
                icon={<AlignLeft className="h-3.5 w-3.5" aria-hidden />}
                hint={metricHelpHint('shared.avgWords')}
              />
              <StatCard
                label={s.stats.avgResponse}
                value={fmtMetric(rootMetrics?.avgResponseMs)}
                icon={<Timer className="h-3.5 w-3.5" aria-hidden />}
                hint={metricHelpHint('views.siteStructure.avgResponse')}
              />
              <StatCard
                label={s.stats.avgPerf}
                value={fmtMetric(rootMetrics?.avgPerfScore)}
                icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
                hint={metricHelpHint('views.siteStructure.avgPerf')}
              />
            </div>
          ) : null}
          {crawlSegments?.segments?.length ? (
            <Card className="mt-4" padding="tight" devData={crawlSegmentsDevData}>
              <h3 className="text-sm font-bold text-foreground mb-1">{s.crawlSegmentsTitle}</h3>
              <p className="text-xs text-muted-foreground mb-3">{s.crawlSegmentsHint}</p>
              {crawlSegments.overall_health != null ? (
                <p className="text-xs text-muted-foreground mb-3">
                  {s.crawlSegmentsOverall}:{' '}
                  <span className="font-semibold text-foreground tabular-nums">{crawlSegments.overall_health}</span>
                </p>
              ) : null}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-3">{s.crawlSegmentsPrefix}</th>
                    <th className="text-right py-2 px-3">{s.crawlSegmentsUrls}</th>
                    <th className="text-right py-2 pl-3">{s.crawlSegmentsHealth}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {crawlSegments.segments.map((seg: CrawlSegmentEntry) => (
                    <tr key={seg.prefix}>
                      <td className="py-2 pr-3 font-mono text-foreground">
                        {seg.prefix}
                        {seg.pattern_type === 'regex' && (
                          <span className="ml-1.5 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-400">regex</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{seg.url_count ?? 0}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{seg.health_score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
          {topLinksByInlinks.length > 0 ? (
            <Card className="mt-4" padding="tight" devData={topInlinksDevData}>
              <h3 className="text-sm font-bold text-foreground mb-3">Top pages by inlinks</h3>
              <ul className="space-y-2 text-xs">
                {topLinksByInlinks.map((link) => (
                  <li key={link.url} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-muted-foreground truncate flex-1 min-w-0">{link.url}</span>
                    <span className="tabular-nums text-muted-foreground">{Number(link.inlinks || 0).toLocaleString()}</span>
                    <UrlInspectorButton url={link.url} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {!tree ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {filteredLinks.length === 0 && (data?.links?.length ?? 0) > 0 ? s.emptyFilter : s.empty}
            </p>
          ) : null}
        </ViewTabPanel>
      )}

      {activeTab === 'tree' && (
        <ViewTabPanel idPrefix="site-structure" tabId="tree">
          <Card padding="none" overflowHidden>
            {!tree ? (
              <p className="text-muted-foreground text-sm py-12 text-center px-4">
                {filteredLinks.length === 0 && (data?.links?.length ?? 0) > 0 ? s.emptyFilter : s.empty}
              </p>
            ) : (
              <SiteStructureTreePanel
                key={panelKey}
                merged={merged}
                tree={tree}
                hasCompare={hasCompare}
                showCompareCharts={showCompareCharts}
                onToggleCharts={() => setShowCompareCharts((v) => !v)}
                s={s}
                filteredLinksLength={filteredLinks.length}
                dataLinksLength={data?.links?.length ?? 0}
              />
            )}
          </Card>
        </ViewTabPanel>
      )}

      {activeTab === 'map' && tree ? (
        <ViewTabPanel idPrefix="site-structure" tabId="map" className="space-y-3">
          {pathPrefixFilter ? (
            <AlertBanner variant="info" className="text-xs py-2 flex flex-wrap items-center gap-2">
              <span>
                Filtering tree to <span className="font-mono font-semibold">{pathPrefixFilter}</span>
              </span>
              <Button
                type="button"
                variant="secondary"
                className="text-xs py-0.5 px-2"
                onClick={() => setPathPrefixFilter(null)}
              >
                Clear filter
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="text-xs py-0.5 px-2"
                onClick={() => setActiveTab('tree')}
              >
                View in tree
              </Button>
            </AlertBanner>
          ) : null}
          <div className="relative group/dev-card">
            <DevCopyJsonButton data={mapDevData} />
            <CrawlMapPanel
              tree={tree}
              crawlSegments={crawlSegments}
              selectedPath={pathPrefixFilter}
              onSelectPath={(pathKey) => {
                setPathPrefixFilter(pathKey);
                setActiveTab('tree');
              }}
            />
          </div>
        </ViewTabPanel>
      ) : null}

      {activeTab === 'graph' && data ? (
        <ViewTabPanel idPrefix="site-structure" tabId="graph">
          <Card padding="default">
            <Suspense fallback={<p className="text-sm text-muted-foreground py-8 text-center">Loading link graph…</p>}>
              <SiteStructureLinkGraph />
            </Suspense>
          </Card>
        </ViewTabPanel>
      ) : null}
    </PageLayout>
  );
}
