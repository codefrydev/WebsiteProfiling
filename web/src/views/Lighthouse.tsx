import { useState, useMemo, useRef, useEffect } from 'react';
import type {
  LighthouseDiagnostic,
  LighthouseFailure,
  LighthousePageSummary,
  ViewProps,
} from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Gauge, Globe, Play } from 'lucide-react';
import { useReport } from '../context/useReport';
import {
  canonicalDomainFromPayload,
  filterLighthouseByHost,
  hostsMatch,
  lighthouseSummaryMatchesHost,
  normalizeDomainQueryParam,
} from '../lib/domainSlug';
import { goToPipeline } from '../lib/pipelineReturn';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Button, ViewTabs, ViewTabPanel, Select } from '../components';
import { paginateSlice, PAGE_SIZE } from '@/components/google/tableUtils';
import type { ViewTabItem } from '../components';
import {
  CATEGORIES, CATEGORY_LABELS, METRIC_THRESHOLDS, IMPACT_GROUPS, QUICK_WINS,
} from '../utils/lighthouseUtils';
import {
  ScoreRing,
  ThresholdBar,
  DiagnosticItem,
  QuickWinCard,
  MultiPageTable,
  LhAuditExpandable,
} from '../components/lighthouse';

const BASE_TABS = ['overview', 'metrics', 'quick-wins', 'audits', 'diagnostics'] as const;
const LH_TABS = [...BASE_TABS, 'pages'] as const;
type LhTabId = (typeof LH_TABS)[number];

const EMPTY_LH: LighthousePageSummary = {};

export default function Lighthouse({ searchQuery = '' }: ViewProps) {
  const router = useRouter();
  const { data, startUrlByRunId } = useReport();
  const searchParams = useSearchParams();
  const detailRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useUrlTab(LH_TABS, 'overview');
  const [activeImpactGroup, setActiveImpactGroup] = useState<string | null>(null);
  const [diagnosticPage, setDiagnosticPage] = useState(1);

  const expectedHost = useMemo(() => {
    const fromPayload = canonicalDomainFromPayload(data, startUrlByRunId);
    const fromQuery = normalizeDomainQueryParam(
      searchParams.get('domain') ?? searchParams.get('brand') ?? '',
    );
    if (fromPayload && fromQuery && !hostsMatch(fromPayload, fromQuery)) return fromPayload;
    return fromPayload || fromQuery;
  }, [data, startUrlByRunId, searchParams]);

  const byUrl = useMemo(() => {
    const raw = data?.lighthouse_by_url || {};
    return filterLighthouseByHost(raw, expectedHost) as Record<string, LighthousePageSummary>;
  }, [data, expectedHost]);
  const urlList = useMemo(() => Object.keys(byUrl), [byUrl]);
  const hasMulti = urlList.length >= 2;
  const q = (searchQuery || '').toLowerCase().trim();
  const urlPool = useMemo(() => {
    if (!q) return urlList;
    return urlList.filter((u) => u.toLowerCase().includes(q));
  }, [urlList, q]);
  const byUrlForTable = useMemo(() => {
    const o: Record<string, LighthousePageSummary> = {};
    urlPool.forEach((u) => {
      if (byUrl[u]) o[u] = byUrl[u];
    });
    return o;
  }, [urlPool, byUrl]);

  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const displayUrl = useMemo(() => {
    if (urlPool.length === 0) return q ? null : (urlList[0] || null);
    if (selectedUrl && urlPool.includes(selectedUrl)) return selectedUrl;
    return urlPool[0];
  }, [urlPool, q, urlList, selectedUrl]);

  const handleSelectUrl = (url: string) => {
    setSelectedUrl(url);
    setActiveTab('overview');
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const summary = useMemo(() => {
    if (displayUrl && byUrl[displayUrl]) return byUrl[displayUrl];
    const global = data?.lighthouse_summary;
    if (global && lighthouseSummaryMatchesHost(global, expectedHost)) return global;
    return EMPTY_LH;
  }, [displayUrl, byUrl, data, expectedHost]);

  const diagnostics = useMemo(() => {
    const perUrl = displayUrl && byUrl[displayUrl]?.diagnostics;
    if (Array.isArray(perUrl) && perUrl.length > 0) return perUrl;
    if (lighthouseSummaryMatchesHost(data?.lighthouse_summary, expectedHost)) {
      return data?.lighthouse_diagnostics || data?.lighthouse_summary?.diagnostics || [];
    }
    return [];
  }, [data, displayUrl, byUrl, expectedHost]);

  const humanSummary = useMemo(() => {
    const fromPage = summary?.human_summary_full || summary?.human_summary;
    if (fromPage) return fromPage;
    if (lighthouseSummaryMatchesHost(data?.lighthouse_summary, expectedHost)) {
      return data?.lighthouse_human_summary || '';
    }
    return '';
  }, [summary, data, expectedHost]);
  const mm = summary?.median_metrics || {};
  const cs = summary?.category_scores || {};
  const topFailures = useMemo(
    () => (summary?.top_failures || []) as LighthouseFailure[],
    [summary?.top_failures],
  );
  const strategy = summary?.strategy || 'mobile';
  const device = summary?.device || strategy;
  const mode = summary?.mode || 'navigation';
  const categories = summary?.categories || ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];
  const runTimestamp = summary?.run_timestamp || '';
  const iterations = summary?.iterations ?? 0;

  const failingAuditsDetailed = useMemo(() => {
    const audits = summary?.audits;
    if (!Array.isArray(audits)) return [];
    return audits.filter((a) => a?.score != null && a.score < 1);
  }, [summary?.audits]);

  const failingAuditsForDisplay = useMemo(() => {
    if (!q) return failingAuditsDetailed;
    return failingAuditsDetailed.filter((a) => {
      const title = (a.title || '').toLowerCase();
      const id = String(a.id || '').toLowerCase();
      const desc = (a.description || '').toLowerCase();
      return title.includes(q) || id.includes(q) || desc.includes(q);
    });
  }, [failingAuditsDetailed, q]);

  const hasData =
    summary?.url ||
    diagnostics.length > 0 ||
    topFailures.length > 0 ||
    failingAuditsDetailed.length > 0;

  const diagnosticsList = useMemo(() => {
    if (diagnostics.length > 0) return diagnostics;
    return topFailures.map((f: LighthouseFailure) => ({
      warning: f.helpText || f.id,
      lighthouse_audit_id: f.id,
      id: f.id,
      primary_impact: f.impact || 'UX',
      severity: 'High',
      one_line_fix: strings.views.lighthouse.defaultFix,
      evidence: f.evidence || [],
    }));
  }, [diagnostics, topFailures]);

  const diagnosticsForGroups = useMemo(() => {
    if (!q) return diagnosticsList;
    return diagnosticsList.filter((d: LighthouseDiagnostic) => {
      const w = (d.warning || '').toLowerCase();
      const id = String(d.lighthouse_audit_id || d.id || '').toLowerCase();
      const fix = (d.one_line_fix || '').toLowerCase();
      return w.includes(q) || id.includes(q) || fix.includes(q);
    });
  }, [diagnosticsList, q]);

  const groupedDiagnostics = useMemo(() => {
    const map: Record<string, LighthouseDiagnostic[]> = {};
    IMPACT_GROUPS.forEach((g) => { map[g.id] = []; });
    diagnosticsForGroups.forEach((d: LighthouseDiagnostic) => {
      const impact = (d.primary_impact || 'UX').trim();
      const grp = IMPACT_GROUPS.find((g) =>
        g.id === impact ||
        g.label.toLowerCase().includes(impact.toLowerCase()) ||
        impact.toLowerCase().includes(g.id.toLowerCase())
      );
      const key = grp ? grp.id : 'UX';
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    return map;
  }, [diagnosticsForGroups]);

  const mostCriticalGroup = useMemo(() => {
    let maxId = 'UX'; let maxCount = 0;
    Object.entries(groupedDiagnostics).forEach(([id, items]) => {
      const critCount = (items as Array<{ severity?: string }>).filter((d) => ['critical', 'high'].includes((d.severity || '').toLowerCase())).length;
      if (critCount > maxCount) { maxCount = critCount; maxId = id; }
    });
    return maxId;
  }, [groupedDiagnostics]);

  const impactGroupTabs = useMemo(
    () =>
      IMPACT_GROUPS.map((group) => ({
        group,
        items: groupedDiagnostics[group.id] || [],
      }))
        .filter(({ items }) => items.length > 0)
        .sort((a, b) => b.items.length - a.items.length)
        .map(({ group, items }) => ({
          id: group.id,
          label: group.label,
          badge: items.length,
        })),
    [groupedDiagnostics],
  );

  const resolvedImpactGroup =
    activeImpactGroup && (groupedDiagnostics[activeImpactGroup]?.length ?? 0) > 0
      ? activeImpactGroup
      : impactGroupTabs.find((t) => t.id === mostCriticalGroup)?.id ?? impactGroupTabs[0]?.id ?? '';

  const activeDiagnostics = groupedDiagnostics[resolvedImpactGroup] || [];

  const {
    slice: visibleDiagnostics,
    page: safeDiagnosticPage,
    totalPages: diagnosticTotalPages,
    total: activeDiagnosticTotal,
    from: diagnosticFrom,
    to: diagnosticTo,
  } = useMemo(
    () => paginateSlice(activeDiagnostics, diagnosticPage, PAGE_SIZE),
    [activeDiagnostics, diagnosticPage],
  );

  useEffect(() => {
    setDiagnosticPage(1);
  }, [resolvedImpactGroup, q]);

  const quickWinStatus = useMemo(() => {
    const allAuditIds = new Set(
      diagnosticsList.map((d) => d.lighthouse_audit_id || d.id).filter(Boolean) as string[],
    );
    const status: Record<string, boolean> = {};
    QUICK_WINS.forEach((w) => {
      status[w.id] = w.auditIds.length === 0 ? false : !w.auditIds.some((aid) => allAuditIds.has(aid));
    });
    return status;
  }, [diagnosticsList]);

  const quickWinFailCount = useMemo(
    () => QUICK_WINS.filter((w) => !(quickWinStatus[w.id] ?? false)).length,
    [quickWinStatus],
  );

  const vlh = strings.views.lighthouse;
  const vlp = vlh.pagination;
  const tabLabels = vlh.tabs as Record<string, string>;

  const lhTabItems = useMemo((): ViewTabItem[] => {
    const items: ViewTabItem[] = [
      { id: 'overview', label: tabLabels.overview },
    ];
    if (hasMulti) {
      items.push({
        id: 'pages',
        label: tabLabels.pages,
        badge: urlPool.length || null,
      });
    }
    items.push(
      { id: 'metrics', label: tabLabels.metrics },
      {
        id: 'quick-wins',
        label: tabLabels.quickWins,
        badge: quickWinFailCount > 0 ? quickWinFailCount : null,
      },
      {
        id: 'audits',
        label: tabLabels.audits,
        badge: failingAuditsDetailed.length > 0 ? failingAuditsDetailed.length : null,
      },
      {
        id: 'diagnostics',
        label: tabLabels.diagnostics,
        badge: diagnosticsList.length > 0 ? diagnosticsList.length : null,
      },
    );
    return items;
  }, [hasMulti, urlPool.length, quickWinFailCount, failingAuditsDetailed.length, diagnosticsList.length, tabLabels]);

  const urlPicker = hasMulti && activeTab !== 'pages' ? (
    <div className="flex items-center gap-2 min-w-0 max-w-md">
      <Globe className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      {urlPool.length === 0 ? (
        <span className="text-sm text-muted-foreground">{vlh.noUrlMatch}</span>
      ) : (
        <Select
          value={displayUrl || ''}
          onChange={(e) => setSelectedUrl(e.target.value || null)}
          className="flex-1 min-w-0 max-w-lg"
          aria-label={vlh.detailedView}
        >
          {urlPool.map((url) => {
            const sc = byUrl[url]?.category_scores?.performance;
            const dot = sc != null ? (sc >= 90 ? '🟢' : sc >= 50 ? '🟡' : '🔴') : '⚪';
            return <option key={url} value={url}>{dot} {url}</option>;
          })}
        </Select>
      )}
    </div>
  ) : null;

  if (!hasData) {
    return (
      <PageLayout className="space-y-6">
        <PageHeader
          icon={<Gauge className="h-7 w-7 text-link shrink-0" />}
          title={vlh.emptyTitle}
          subtitle={vlh.emptySubtitle}
        />
        <Card className="mx-auto max-w-lg p-8 text-center">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Gauge className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">{vlh.emptyBody}</p>
          <Button
            variant="primary"
            className="mt-6"
            onClick={() => goToPipeline(router.push, { preset: 'lighthouse' })}
          >
            <Play className="h-4 w-4" aria-hidden />
            {vlh.runInPipeline}
          </Button>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="space-y-6">
      <div ref={detailRef}>
        <PageHeader
          icon={<Gauge className="h-7 w-7 text-link shrink-0" />}
          title={vlh.pageSpeedTitle}
          subtitle={
            summary.url ? (
              <a href={summary.url} target="_blank" rel="noreferrer" className="text-link hover:underline break-all text-sm">
                {summary.url}
              </a>
            ) : undefined
          }
          actions={urlPicker}
        />
      </div>

      <Card padding="tight">
        <h3 className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-3">{vlh.analysisSettings}</h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <div><span className="text-muted-foreground block text-xs mb-0.5">{vlh.mode}</span><span className="text-foreground font-medium capitalize">{mode}</span></div>
          <div><span className="text-muted-foreground block text-xs mb-0.5">{vlh.device}</span><span className="text-foreground font-medium capitalize">{device}</span></div>
          <div className="min-w-0">
            <span className="text-muted-foreground block text-xs mb-0.5">{vlh.categories}</span>
            <span className="text-foreground font-medium">
              {Array.isArray(categories)
                ? categories.map((c) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] || c).join(', ')
                : vlh.categoriesFallback}
            </span>
          </div>
        </div>
        {(runTimestamp || iterations) && (
          <p className="text-muted-foreground text-xs mt-3 pt-3 border-t border-muted">
            {iterations > 0 && <span>{format(vlh.runsMediansFull, { n: iterations })}</span>}
            {runTimestamp && <span className="ml-3">{vlh.generated} {new Date(runTimestamp).toLocaleString()}</span>}
          </p>
        )}
      </Card>

      {data?.crux_summary?.ok && (
        <Card padding="tight">
          <h3 className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-3">
            Real users (CrUX)
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['lcp', 'inp', 'cls'] as const).map((metric) => {
              const pass = data.crux_summary?.pass?.[metric];
              const p75 = data.crux_summary?.metrics?.[
                metric === 'lcp' ? 'largest_contentful_paint' : metric === 'inp' ? 'interaction_to_next_paint' : 'cumulative_layout_shift'
              ]?.p75;
              return (
                <div key={metric}>
                  <span className="text-muted-foreground uppercase text-xs">{metric}</span>
                  <p className={`font-medium ${pass ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {p75 != null ? String(p75) : '—'} {pass === false ? '(needs improvement)' : pass ? '(good)' : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <ViewTabs
        tabs={lhTabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as LhTabId)}
        ariaLabel={vlh.pageSpeedTitle}
        idPrefix="lh"
      />

      {activeTab === 'overview' && (
        <div id="lh-tab-overview" role="tabpanel" aria-labelledby="lh-tab-btn-overview" className="space-y-6">
          <div>
            <h2 className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-4">{vlh.categoriesSection}</h2>
            <div className="flex flex-wrap gap-6 justify-start items-center">
              {CATEGORIES.map(({ id, label }) => (
                <ScoreRing key={id} label={label} score={cs[id] != null ? Number(cs[id]) : null} />
              ))}
            </div>
            <div className="flex flex-wrap gap-6 mt-4 text-xs text-muted-foreground">
              <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />{vlh.scorePoor}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />{vlh.scoreNeeds}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{vlh.scoreGood}</span>
            </div>
          </div>

          {humanSummary ? (
            <Card>
              <h2 className="text-foreground text-sm font-bold uppercase tracking-wider mb-3">{vlh.summary}</h2>
              <pre className="text-muted-foreground text-sm whitespace-pre-wrap font-sans">{humanSummary}</pre>
            </Card>
          ) : null}
        </div>
      )}

      {activeTab === 'pages' && hasMulti && (
        <div id="lh-tab-pages" role="tabpanel" aria-labelledby="lh-tab-btn-pages" className="space-y-4">
          <p className="text-muted-foreground text-sm">{vlh.multiCompareHint}</p>
          <Card padding="none" overflowHidden>
            <MultiPageTable byUrl={byUrlForTable} selectedUrl={displayUrl} onSelect={handleSelectUrl} />
          </Card>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div id="lh-tab-metrics" role="tabpanel" aria-labelledby="lh-tab-btn-metrics" className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {format(vlh.metricsHint, { runs: iterations || 1 })}
          </p>
          <Card overflowHidden padding="none">
            <div className="divide-y divide-muted">
              {(Object.keys(METRIC_THRESHOLDS) as Array<keyof typeof METRIC_THRESHOLDS>).map((key) => (
                <ThresholdBar key={key} metricKey={key} value={mm[key] as number | null | undefined} />
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'quick-wins' && (
        <div id="lh-tab-quick-wins" role="tabpanel" aria-labelledby="lh-tab-btn-quick-wins" className="space-y-4">
          <p className="text-muted-foreground text-sm">{vlh.quickWinsHint}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QUICK_WINS.map((win) => (
              <QuickWinCard key={win.id} win={win} passed={quickWinStatus[win.id] ?? false} />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'audits' && (
        <div id="lh-tab-audits" role="tabpanel" aria-labelledby="lh-tab-btn-audits" className="space-y-4">
          <p className="text-muted-foreground text-sm">{vlh.auditTablesHint}</p>
          {failingAuditsDetailed.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">{vlh.allChecksPassed}</Card>
          ) : failingAuditsForDisplay.length > 0 ? (
            <ul className="space-y-2">
              {failingAuditsForDisplay.map((a) => (
                <LhAuditExpandable key={a.id} audit={a} />
              ))}
            </ul>
          ) : (
            <Card className="p-4 text-muted-foreground text-sm">{vlh.noAuditsSearch}</Card>
          )}
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div id="lh-tab-diagnostics" role="tabpanel" aria-labelledby="lh-tab-btn-diagnostics" className="space-y-4">
          <p className="text-muted-foreground text-sm">{vlh.diagnosticsHint}</p>
          {diagnosticsList.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">{vlh.allChecksPassed}</Card>
          ) : diagnosticsForGroups.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">{vlh.noDiagnosticsSearch}</Card>
          ) : (
            <div className="space-y-4">
              {impactGroupTabs.length > 1 ? (
                <ViewTabs
                  tabs={impactGroupTabs}
                  activeTab={resolvedImpactGroup}
                  onChange={(id) => setActiveImpactGroup(id)}
                  ariaLabel={vlh.diagnostics}
                  idPrefix="lh-diagnostics"
                />
              ) : null}
              <ViewTabPanel idPrefix="lh-diagnostics" tabId={resolvedImpactGroup} className="space-y-2">
                {visibleDiagnostics.map((d, i) => (
                  <DiagnosticItem key={`${resolvedImpactGroup}-${safeDiagnosticPage}-${i}`} d={d} />
                ))}
              </ViewTabPanel>
              {activeDiagnosticTotal > 0 ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pt-1">
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <div>{format(vlp.showingSlice, { from: diagnosticFrom, to: diagnosticTo, total: activeDiagnosticTotal })}</div>
                    <div className="text-xs">
                      {vlp.pageOf}{' '}
                      <span className="font-bold text-bright tabular-nums">{safeDiagnosticPage}</span> {vlp.of}{' '}
                      <span className="font-bold text-bright tabular-nums">{diagnosticTotalPages}</span>
                      <span className="text-muted-foreground ml-2">
                        ({format(vlp.rowsPerPage, { n: PAGE_SIZE })})
                      </span>
                    </div>
                  </div>
                  {diagnosticTotalPages > 1 ? (
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => setDiagnosticPage((p) => Math.max(1, p - 1))}
                        disabled={safeDiagnosticPage <= 1}
                        className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                      >
                        {vlp.previous}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setDiagnosticPage((p) => Math.min(diagnosticTotalPages, p + 1))}
                        disabled={safeDiagnosticPage >= diagnosticTotalPages}
                        className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                      >
                        {vlp.next}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
