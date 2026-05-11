import { useMemo, useState, useCallback } from 'react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { canonicalDomainFromPayload } from '../lib/domainSlug';
import {
  aggregateLinksByPath,
  mergeWithBaseline,
  buildPathTree,
  flattenTreeForTable,
  defaultExpandedPathKeys,
  filterLinksBySearch,
  finalizeRollup,
} from '../lib/siteStructureTree';
import { PageLayout, PageHeader, Card, Button } from '../components';
import PathTreeTable from '../components/siteStructure/PathTreeTable.jsx';

/**
 * Isolated tree + expansion state; remount via `key` when report/search slice changes.
 */
function SiteStructureTreePanel({
  merged,
  tree,
  hasCompare,
  showCompareCharts,
  onToggleCharts,
  s,
  filteredLinksLength,
  dataLinksLength,
}) {
  const [expanded, setExpanded] = useState(() =>
    !merged.size ? new Set(['/']) : defaultExpandedPathKeys([...merged.keys()], 2)
  );

  const visibleRows = useMemo(() => {
    if (!tree) return [];
    const out = [];
    flattenTreeForTable(tree, expanded, 0, out);
    return out;
  }, [tree, expanded]);

  const togglePath = useCallback((pathKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!merged.size) return;
    setExpanded(new Set([...merged.keys()]));
  }, [merged]);

  const collapseToDefault = useCallback(() => {
    if (!merged.size) {
      setExpanded(new Set(['/']));
      return;
    }
    setExpanded(defaultExpandedPathKeys([...merged.keys()], 2));
  }, [merged]);

  if (!tree || visibleRows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        {filteredLinksLength === 0 && dataLinksLength > 0 ? s.emptyFilter : s.empty}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button type="button" variant="secondary" className="text-xs" onClick={expandAll}>
          {s.expandAll}
        </Button>
        <Button type="button" variant="secondary" className="text-xs" onClick={collapseToDefault}>
          {s.collapseDefault}
        </Button>
        {hasCompare ? (
          <Button
            type="button"
            variant={showCompareCharts ? 'secondary' : 'primary'}
            className="text-xs"
            onClick={onToggleCharts}
          >
            {showCompareCharts ? s.toggleChartsHide : s.toggleChartsShow}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground mb-2">{strings.common.tableSwipeHint}</p>
      {hasCompare && showCompareCharts ? (
        <p className="text-xs text-muted-foreground mb-3">{s.changeLegend}</p>
      ) : null}
      <PathTreeTable
        rows={visibleRows}
        expanded={expanded}
        onToggle={togglePath}
        hasCompare={hasCompare}
        showCompareCharts={showCompareCharts}
        s={s}
      />
    </>
  );
}

export default function SiteStructure({ searchQuery = '' }) {
  const s = strings.views.siteStructure;
  const { data, compareData, sqlDb, selectedReportId, compareReportId } = useReport();

  const startUrlByRunId = useMemo(() => {
    const m = new Map();
    if (!sqlDb) return m;
    try {
      const runRows = sqlDb.exec('SELECT id, start_url FROM crawl_runs');
      if (!runRows.length || !runRows[0].values.length) return m;
      const cols = runRows[0].columns;
      const idIdx = cols.indexOf('id');
      const urlIdx = cols.indexOf('start_url');
      for (const row of runRows[0].values) {
        m.set(Number(row[idIdx]), String(row[urlIdx] || ''));
      }
    } catch {
      /* ignore */
    }
    return m;
  }, [sqlDb]);

  const expectedHost = useMemo(
    () => canonicalDomainFromPayload(data, startUrlByRunId),
    [data, startUrlByRunId]
  );

  const filteredLinks = useMemo(
    () => filterLinksBySearch(data?.links || [], searchQuery),
    [data?.links, searchQuery]
  );

  const baselineLinks = useMemo(
    () => filterLinksBySearch(compareData?.links || [], searchQuery),
    [compareData?.links, searchQuery]
  );

  const hasCompare = compareData != null && compareReportId != null;

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

  const [showCompareCharts, setShowCompareCharts] = useState(true);

  const panelKey = [
    selectedReportId ?? '',
    compareReportId ?? '',
    searchQuery,
    String(filteredLinks.length),
    String(baselineLinks.length),
    expectedHost,
  ].join('|');

  const subtitle = hasCompare ? `${s.subtitle} ${s.subtitleCompareHint}` : s.subtitle;

  if (!data) return null;

  return (
    <PageLayout>
      <PageHeader title={s.title} subtitle={subtitle} />
      <p className="text-xs text-muted-foreground mb-4">{s.metricsDisclaimer}</p>

      <Card className="p-4 sm:p-5">
        {!tree ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
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
    </PageLayout>
  );
}
