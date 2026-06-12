'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUrlTab } from '@/hooks/useUrlTab';
import {
  ArrowLeftRight,
  FolderTree,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { formatReportGeneratedAt } from '../lib/reportTimestamps';
import {
  PageLayout,
  PageHeader,
  Card,
  AlertBanner,
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
  Badge,
} from '../components';
import ReportCompareControls from '../components/ReportCompareControls';
import { CompareMetricCard } from '../components/compare/CompareDeltaBadge';
import {
  CompareIssuesPanel,
  ComparePerformancePanel,
  CompareContentPanel,
  CompareLinksPanel,
  CompareGooglePanel,
} from '../components/compare/CompareTabPanels';
import CompareUrlMetadataTable from '../components/compare/CompareUrlMetadataTable';
import dynamic from 'next/dynamic';

const CompareOverviewCharts = dynamic(
  () => import('../components/compare/CompareCharts').then((m) => m.CompareOverviewCharts),
  { ssr: false, loading: () => <div className="h-56 rounded-xl bg-brand-800/40 animate-pulse" /> },
);
const CompareUrlChangeChart = dynamic(
  () => import('../components/compare/CompareCharts').then((m) => m.CompareUrlChangeChart),
  { ssr: false },
);
import type { ViewProps } from '@/types';

type CompareTab =
  | 'overview'
  | 'urls'
  | 'status'
  | 'issues'
  | 'performance'
  | 'content'
  | 'links'
  | 'google'
  | 'audit';
type UrlTab = 'all' | 'new' | 'removed' | 'content' | 'structure' | 'fields';

const URL_TABS = ['all', 'new', 'removed', 'content', 'structure', 'fields'] as const;

function filterUrls(urls: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return urls;
  return urls.filter((u) => u.toLowerCase().includes(q));
}

function ScoreDelta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {delta}
    </span>
  );
}

function UrlDiffTable({
  urls,
  emptyLabel,
  onCopy,
  copyLabel,
}: {
  urls: string[];
  emptyLabel: string;
  onCopy: (urls: string[]) => void;
  copyLabel: string;
}) {
  if (urls.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyLabel}</p>;
  }
  return (
    <>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => onCopy(urls)}
          className="text-xs text-link hover:underline font-medium"
        >
          {copyLabel}
        </button>
      </div>
      <div className="max-h-[min(480px,55vh)] overflow-y-auto border border-default rounded-lg">
        <Table>
          <TableHead sticky>
            <TableRow>
              <TableHeadCell>URL ({urls.length})</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody striped>
            {urls.map((u) => (
              <TableRow key={u}>
                <TableCell className="font-mono text-xs break-all">{u}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

const TAB_KEYS = [
  'overview',
  'urls',
  'status',
  'issues',
  'performance',
  'content',
  'links',
  'google',
  'audit',
] as const satisfies readonly CompareTab[];

export default function CompareReports({ searchQuery = '' }: ViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab] = useUrlTab(TAB_KEYS, 'overview', 'tab');
  const [urlTab, setUrlTab] = useUrlTab(URL_TABS, 'all', 'urlTab');
  const setTab = useCallback(
    (next: CompareTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      if (next !== 'urls') {
        params.delete('urlTab');
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const [copyHint, setCopyHint] = useState('');
  const { reportList, reportCompare, compareReportId, selectedReportId, loading, error } = useReport();
  const vc = strings.views.compare;
  const vo = strings.views.overview;

  const siteStructureHref = useMemo(() => {
    const q = searchParams.toString();
    return q ? `/site-structure?${q}` : '/site-structure';
  }, [searchParams]);

  const effectiveId = selectedReportId ?? reportList[0]?.id ?? null;
  const newerRow = reportList.find((r) => r.id === effectiveId) ?? reportList[0];
  const baselineRow = reportList.find((r) => r.id === compareReportId);

  const urlLists = useMemo(() => {
    if (!reportCompare) return null;
    const fp = reportCompare.fingerprint;
    return {
      newUrls: filterUrls(fp.newUrls, searchQuery),
      removedUrls: filterUrls(fp.removedUrls, searchQuery),
      contentChanged: filterUrls(fp.contentChanged, searchQuery),
      structureChanged: filterUrls(fp.structureChanged, searchQuery),
    };
  }, [reportCompare, searchQuery]);

  const activeUrlList = useMemo(() => {
    if (!urlLists) return [];
    if (urlTab === 'new') return urlLists.newUrls;
    if (urlTab === 'removed') return urlLists.removedUrls;
    if (urlTab === 'content') return urlLists.contentChanged;
    if (urlTab === 'structure') return urlLists.structureChanged;
    const seen = new Set<string>();
    const all: string[] = [];
    for (const u of [
      ...urlLists.newUrls,
      ...urlLists.removedUrls,
      ...urlLists.contentChanged,
      ...urlLists.structureChanged,
    ]) {
      if (!seen.has(u)) {
        seen.add(u);
        all.push(u);
      }
    }
    return all.sort((a, b) => a.localeCompare(b));
  }, [urlLists, urlTab]);

  const metadataFiltered = useMemo(() => {
    if (!reportCompare) return [];
    const q = searchQuery.trim().toLowerCase();
    const rows = reportCompare.urlMetadataChanges || [];
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.url.toLowerCase().includes(q) ||
        r.field.toLowerCase().includes(q) ||
        r.baseline.toLowerCase().includes(q) ||
        r.current.toLowerCase().includes(q),
    );
  }, [reportCompare, searchQuery]);

  const statusFiltered = useMemo(() => {
    if (!reportCompare) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return reportCompare.statusChanges;
    return reportCompare.statusChanges.filter(
      (r) =>
        r.url.toLowerCase().includes(q) ||
        r.currentStatus.toLowerCase().includes(q) ||
        r.baselineStatus.toLowerCase().includes(q),
    );
  }, [reportCompare, searchQuery]);

  const copyUrls = useCallback(
    (urls: string[]) => {
      if (!urls.length) return;
      void navigator.clipboard.writeText(urls.join('\n')).then(() => {
        setCopyHint(vc.copiedUrls);
        setTimeout(() => setCopyHint(''), 2000);
      });
    },
    [vc.copiedUrls],
  );

  const tabLabels: Record<CompareTab, string> = {
    overview: vc.tabOverview,
    urls: vc.tabUrls,
    status: vc.tabStatus,
    issues: vc.tabIssues,
    performance: vc.tabPerformance,
    content: vc.tabContent,
    links: vc.tabLinks,
    google: vc.tabGoogle,
    audit: vc.tabAudit,
  };

  const panelProps = useMemo(
    () =>
      reportCompare
        ? {
            compare: reportCompare,
            searchQuery,
            vc,
            emptyLabel: vc.unchangedSummary,
            siteMetrics: reportCompare.metrics,
          }
        : null,
    [reportCompare, searchQuery, vc],
  );

  const visibleTabs = useMemo((): CompareTab[] => {
    if (!reportCompare?.extras.googleAvailable) {
      return TAB_KEYS.filter((t) => t !== 'google') as CompareTab[];
    }
    return [...TAB_KEYS];
  }, [reportCompare?.extras.googleAvailable]);

  const urlTabLabels: { id: UrlTab; label: string; count: number }[] = useMemo(() => {
    if (!urlLists) return [];
    const allCount = new Set([
      ...urlLists.newUrls,
      ...urlLists.removedUrls,
      ...urlLists.contentChanged,
      ...urlLists.structureChanged,
    ]).size;
    return [
      { id: 'all', label: vc.urlTabs.all, count: allCount },
      { id: 'new', label: vc.urlTabs.new, count: urlLists.newUrls.length },
      { id: 'removed', label: vc.urlTabs.removed, count: urlLists.removedUrls.length },
      { id: 'content', label: vc.urlTabs.content, count: urlLists.contentChanged.length },
      { id: 'structure', label: vc.urlTabs.structure, count: urlLists.structureChanged.length },
      { id: 'fields', label: 'Title / canonical', count: reportCompare?.urlMetadataChanges?.length ?? 0 },
    ];
  }, [urlLists, vc.urlTabs, reportCompare?.urlMetadataChanges?.length]);

  return (
    <PageLayout className="space-y-6">
      <PageHeader title={vc.title} subtitle={vc.subtitle} />

      <Card shadow>
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="h-5 w-5 text-cyan-700 dark:text-cyan-400 shrink-0" />
          <h2 className="text-sm font-bold text-foreground">{vc.selectReports}</h2>
        </div>
        <ReportCompareControls />
        {reportList.length >= 2 && newerRow && baselineRow && compareReportId != null ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-blue-500/15 border border-blue-500/30 px-2 py-1 text-link">
              {vc.newerLabel}: {formatReportGeneratedAt(newerRow.generated_at)}
            </span>
            <span className="rounded-md bg-brand-900 border border-default px-2 py-1 text-muted-foreground">
              {vc.baselineLabel}: {formatReportGeneratedAt(baselineRow.generated_at)}
            </span>
            <button
              type="button"
              className="ml-auto px-3 py-1.5 rounded-lg border border-default bg-brand-800 hover:bg-brand-700 text-foreground text-xs font-medium"
              onClick={() => {
                void fetch('/api/compare/export', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    reportIdA: compareReportId,
                    reportIdB: selectedReportId,
                  }),
                })
                  .then(async (res) => {
                    if (!res.ok) throw new Error('Export failed');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `compare-${compareReportId}-vs-${selectedReportId}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch(() => setCopyHint(vc.exportCsvFailed));
              }}
            >
              Export issue diff (CSV)
            </button>
            {copyHint ? (
              <span className="text-xs text-rose-600 dark:text-rose-400">{copyHint}</span>
            ) : null}
          </div>
        ) : null}
        {reportList.length >= 2 && compareReportId == null && !loading && !error ? (
          <p className="text-sm text-muted-foreground mt-4">{vc.pickBaseline}</p>
        ) : null}
      </Card>

      {reportCompare && compareReportId != null ? (
        <>
          {!reportCompare.urlChangeListsAvailable ? (
            <AlertBanner variant="warning" className="text-xs">
              {vc.urlChangeListsUnavailable}
            </AlertBanner>
          ) : null}

          <div className="flex flex-wrap gap-1 border-b border-default pb-1 overflow-x-auto">
            {visibleTabs.map((id) => {
              let badge: number | null = null;
              if (reportCompare && id !== 'overview' && id !== 'audit') {
                const ex = reportCompare.extras;
                if (id === 'issues') {
                  badge =
                    ex.issueDeltas.length +
                    ex.securityDeltas.length +
                    ex.redirectDeltas.length;
                } else if (id === 'performance') badge = ex.lighthouseUrls.length;
                else if (id === 'content') badge = ex.duplicateDeltas.length + ex.techDeltas.length;
                else if (id === 'links') badge = ex.linkMetrics.length;
                else if (id === 'google' && ex.googleAvailable) {
                  badge = ex.googleMetrics.filter((m) => m.delta != null && m.delta !== 0).length;
                } else if (id === 'status') badge = reportCompare.statusChanges.length;
                else if (id === 'urls' && urlLists) {
                  badge = new Set([
                    ...urlLists.newUrls,
                    ...urlLists.removedUrls,
                    ...urlLists.contentChanged,
                    ...urlLists.structureChanged,
                  ]).size;
                }
              }
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0 ${
                    tab === id
                      ? 'bg-blue-500/15 text-link border border-b-0 border-blue-500/30 -mb-px'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tabLabels[id]}
                  {badge != null && badge > 0 ? (
                    <span className="ml-1.5 tabular-nums text-xs opacity-80">({badge})</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {tab === 'overview' ? (
            <div className="space-y-6">
              <CompareOverviewCharts
                compare={reportCompare}
                metrics={reportCompare.metrics}
                vc={vc}
              />

              <div>
                <h3 className="text-sm font-bold text-foreground mb-1">{vc.siteMetrics}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vc.siteMetricsHint}</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {reportCompare.metrics.map((row) => (
                    <CompareMetricCard key={row.id} row={row} />
                  ))}
                </div>
              </div>

              {urlLists &&
              (urlLists.newUrls.length > 0 ||
                urlLists.removedUrls.length > 0 ||
                urlLists.contentChanged.length > 0 ||
                urlLists.structureChanged.length > 0) ? (
                <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <CompareUrlChangeChart
                    newCount={urlLists.newUrls.length}
                    removedCount={urlLists.removedUrls.length}
                    contentCount={urlLists.contentChanged.length}
                    structureCount={urlLists.structureChanged.length}
                    vc={vc}
                  />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="p-4">
                    <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.newUrls}</div>
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{urlLists.newUrls.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.removedUrls}</div>
                    <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">{urlLists.removedUrls.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.contentChanged}</div>
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{urlLists.contentChanged.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.structureChanged}</div>
                    <div className="text-2xl font-bold text-foreground">{urlLists.structureChanged.length}</div>
                  </Card>
                </div>
                </>
              ) : (
                <Card shadow>
                  <p className="text-sm text-muted-foreground">{vc.noDifferences}</p>
                </Card>
              )}

              <p className="text-xs text-muted-foreground max-w-3xl">{vo.reportComparisonHint}</p>
            </div>
          ) : null}

          {tab === 'urls' && urlLists ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {urlTabLabels.map(({ id, label, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setUrlTab(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      urlTab === id
                        ? 'bg-blue-500/15 border-blue-500/35 text-link'
                        : 'border-default text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
              {copyHint ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{copyHint}</p> : null}
              {urlTab === 'fields' ? (
                <Card shadow>
                  <CompareUrlMetadataTable rows={metadataFiltered} emptyLabel={vc.noneInCategory} />
                </Card>
              ) : (
              <Card shadow>
                <UrlDiffTable
                  urls={activeUrlList}
                  emptyLabel={vc.noneInCategory}
                  onCopy={copyUrls}
                  copyLabel={vc.copyUrls}
                />
              </Card>
              )}
            </div>
          ) : null}

          {tab === 'status' ? (
            <Card shadow>
              <h3 className="text-sm font-bold text-foreground mb-3">{vc.statusChanges}</h3>
              {statusFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{vc.unchangedSummary}</p>
              ) : (
                <div className="max-h-[min(480px,55vh)] overflow-y-auto">
                  <Table>
                    <TableHead sticky>
                      <TableRow>
                        <TableHeadCell>{vc.statusColUrl}</TableHeadCell>
                        <TableHeadCell>{vc.statusColBefore}</TableHeadCell>
                        <TableHeadCell>{vc.statusColAfter}</TableHeadCell>
                      </TableRow>
                    </TableHead>
                    <TableBody striped>
                      {statusFiltered.map((row) => (
                        <TableRow key={row.url}>
                          <TableCell className="font-mono text-xs break-all max-w-[40%]">{row.url}</TableCell>
                          <TableCell>
                            <Badge variant="medium" label={row.baselineStatus} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="high" label={row.currentStatus} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          ) : null}

          {tab === 'issues' && panelProps ? <CompareIssuesPanel {...panelProps} /> : null}

          {tab === 'performance' && panelProps ? <ComparePerformancePanel {...panelProps} /> : null}

          {tab === 'content' && panelProps ? <CompareContentPanel {...panelProps} /> : null}

          {tab === 'links' && panelProps ? <CompareLinksPanel {...panelProps} /> : null}

          {tab === 'google' && panelProps ? <CompareGooglePanel {...panelProps} /> : null}

          {tab === 'audit' ? (
            <div className="space-y-6">
              {reportCompare.categoryScores.length > 0 ? (
                <Card shadow>
                  <h3 className="text-sm font-bold text-foreground mb-3">{vc.categoryScores}</h3>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeadCell>Category</TableHeadCell>
                        <TableHeadCell>Current</TableHeadCell>
                        <TableHeadCell>Baseline</TableHeadCell>
                        <TableHeadCell>Δ</TableHeadCell>
                      </TableRow>
                    </TableHead>
                    <TableBody striped>
                      {reportCompare.categoryScores.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="tabular-nums">{row.current ?? '—'}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{row.baseline ?? '—'}</TableCell>
                          <TableCell>
                            <ScoreDelta delta={row.delta} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ) : (
                <Card shadow>
                  <p className="text-sm text-muted-foreground">{vc.unchangedSummary}</p>
                </Card>
              )}

              {reportCompare.seoHealth.length > 0 ? (
                <Card shadow>
                  <h3 className="text-sm font-bold text-foreground mb-3">{vc.seoSignals}</h3>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeadCell>Signal</TableHeadCell>
                        <TableHeadCell>Current</TableHeadCell>
                        <TableHeadCell>Baseline</TableHeadCell>
                        <TableHeadCell>Δ</TableHeadCell>
                      </TableRow>
                    </TableHead>
                    <TableBody striped>
                      {reportCompare.seoHealth.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.label}</TableCell>
                          <TableCell className="tabular-nums">{row.current}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{row.baseline}</TableCell>
                          <TableCell>
                            <span
                              className={
                                (row.higherIsBetter ? row.delta > 0 : row.delta < 0)
                                  ? 'text-emerald-700 dark:text-emerald-400 text-xs font-semibold'
                                  : 'text-rose-700 dark:text-rose-400 text-xs font-semibold'
                              }
                            >
                              {row.delta > 0 ? '+' : ''}
                              {row.delta}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ) : null}
            </div>
          ) : null}

          <Card shadow className="border border-cyan-600/25 bg-cyan-500/5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="flex items-start gap-2 min-w-0">
                <FolderTree className="h-5 w-5 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{vc.siteStructureHint}</p>
              </div>
              <Link
                href={siteStructureHref}
                className="shrink-0 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
              >
                {vc.openSiteStructure}
              </Link>
            </div>
          </Card>
        </>
      ) : null}

      {!loading && !error && reportList.length >= 2 && compareReportId != null && !reportCompare ? (
        <Card shadow>
          <p className="text-sm text-muted-foreground">{vc.urlChangeListsUnavailable}</p>
        </Card>
      ) : null}
    </PageLayout>
  );
}
