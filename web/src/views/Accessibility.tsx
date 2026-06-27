
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Accessibility, ChevronDown, ChevronRight, List } from 'lucide-react';
import { useReport } from '@/context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { useActivePropertyContext } from '@/hooks/useActivePropertyContext';
import {
  PageLayout,
  PageHeader,
  Card,
  StatCard,
  ViewTabs,
  ViewTabPanel,
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
} from '@/components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import { paginateSlice, PAGE_SIZE } from '@/components/google/tableUtils';
import { useUrlTab } from '@/hooks/useUrlTab';
import { fetchAuditTool } from '@/lib/fetchAuditTool';
import {
  aggregateAxeRules,
  flattenAxePages,
  getAxeScopeInfo,
  type FlatAxePageRow,
} from '@/lib/axeViolations';
import { strings } from '@/lib/strings';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import type { ViewProps } from '@/types';

const TABS = ['summary', 'pages'] as const;
type TabId = (typeof TABS)[number];

export default function AccessibilityView({ searchQuery = '' }: ViewProps) {
  const { data } = useReport();
  useSectionData('links');
  const linksReady = useSectionsViewReady(['links']);
  const { propertyId, reportId, contextReady } = useActivePropertyContext();
  const va = strings.views.accessibility;
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'summary');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [apiSummary, setApiSummary] = useState<Record<string, unknown> | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const scope = useMemo(() => getAxeScopeInfo(data), [data]);
  const allRows = useMemo(() => flattenAxePages(data?.links), [data?.links]);
  const clientRules = useMemo(() => aggregateAxeRules(allRows), [allRows]);

  const q = (searchQuery || '').toLowerCase().trim();
  const filteredRows = useMemo(() => {
    if (!q) return allRows;
    return allRows.filter((r) =>
      [r.url, r.title, ...r.violations.map((v) => v.id || ''), ...r.violations.map((v) => v.description || '')]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [allRows, q]);

  const pagination = useMemo(
    () => paginateSlice(filteredRows, page, PAGE_SIZE),
    [filteredRows, page],
  );

  useEffect(() => {
    setPage(1);
  }, [q, activeTab]);

  useEffect(() => {
    if (!contextReady || !propertyId) return;
    let cancelled = false;
    setSummaryError(null);
    void fetchAuditTool({
      toolName: 'get_axe_audit_summary',
      propertyId,
      reportId,
    })
      .then((result) => {
        if (!cancelled) setApiSummary(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setSummaryError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [contextReady, propertyId, reportId]);

  const pagesWithViolations =
    Number(apiSummary?.pages_with_violations) || allRows.length;
  const totalViolations =
    Number(apiSummary?.total_violations) ||
    allRows.reduce((n, r) => n + r.violationCount, 0);
  const topRules = useMemo(() => {
    const fromApi = apiSummary?.violations_by_rule;
    if (Array.isArray(fromApi) && fromApi.length) {
      return fromApi as Array<{ rule_id?: string; count?: number }>;
    }
    return clientRules.map((r) => ({ rule_id: r.ruleId, count: r.count }));
  }, [apiSummary, clientRules]);

  const summaryStatsDevData = useMemo(
    () => ({
      widget: 'accessibility.summary.stats',
      renderMode: scope.renderMode,
      usesBrowser: scope.usesBrowser,
      pagesWithViolations,
      totalViolations,
      ruleCount: topRules.length,
      summaryError,
    }),
    [
      pagesWithViolations,
      scope.renderMode,
      scope.usesBrowser,
      summaryError,
      topRules.length,
      totalViolations,
    ],
  );

  const topRulesDevData = useMemo(
    () => ({
      widget: 'accessibility.summary.topRules',
      source:
        Array.isArray(apiSummary?.violations_by_rule) && apiSummary.violations_by_rule.length
          ? 'api'
          : 'client',
      totalRuleTypes: topRules.length,
      rules: topRules.slice(0, 15).map((rule) => ({
        rule_id: rule.rule_id ?? null,
        count: rule.count ?? null,
      })),
    }),
    [apiSummary?.violations_by_rule, topRules],
  );

  const pagesTableDevData = useMemo(
    () => ({
      widget: 'accessibility.pages.table',
      searchQuery: q || null,
      page: pagination.page,
      totalPages: pagination.totalPages,
      from: pagination.from,
      to: pagination.to,
      total: pagination.total,
      expanded,
      rows: pagination.slice.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title ?? null,
        violationCount: row.violationCount,
        violations: row.violations.map((v) => ({
          id: v.id ?? null,
          impact: v.impact ?? null,
          description: v.description ?? null,
          nodes: v.nodes ?? null,
        })),
      })),
    }),
    [expanded, pagination, q],
  );

  const emptyBecauseNoAxe = allRows.length === 0 && !scope.usesBrowser;

  if (!linksReady) {
    return <ViewSectionLoading title={va.title} />;
  }

  return (
    <PageLayout>
      <PageHeader
        title={va.title}
        subtitle={va.subtitle}
        icon={<Accessibility className="h-7 w-7 text-link shrink-0" />}
      />

      {!scope.usesBrowser ? (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-foreground">{va.browserRequiredHint}</p>
        </Card>
      ) : (
        <Card className="mb-4 border-default bg-brand-800/40 p-4">
          <p className="text-sm text-muted-foreground">{va.axeEnableHint}</p>
        </Card>
      )}

      {emptyBecauseNoAxe ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{va.noDataHint}</p>
        </Card>
      ) : (
        <>
          <ViewTabs
            tabs={[
              { id: 'summary', label: va.tabSummary },
              { id: 'pages', label: va.tabPages, badge: allRows.length || undefined },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            ariaLabel={va.title}
            idPrefix="accessibility"
          />

          {activeTab === 'summary' ? (
          <ViewTabPanel idPrefix="accessibility" tabId="summary" className="space-y-6">
            <div className="relative group/dev-card grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <DevCopyJsonButton data={summaryStatsDevData} />
              <StatCard label={va.statPages} value={pagesWithViolations} />
              <StatCard label={va.statViolations} value={totalViolations} />
              <StatCard label={va.statRules} value={topRules.length} />
            </div>
            {summaryError ? (
              <p className="text-xs text-muted-foreground mb-4">{summaryError}</p>
            ) : null}
            <Card devData={topRulesDevData}>
              <h3 className="text-sm font-semibold text-foreground mb-3">{va.topRulesTitle}</h3>
              {topRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">{va.noViolations}</p>
              ) : (
                <ul className="space-y-2">
                  {topRules.slice(0, 15).map((rule) => (
                    <li
                      key={String(rule.rule_id)}
                      className="flex items-center justify-between text-sm gap-4"
                    >
                      <span className="font-mono text-xs text-foreground truncate">{rule.rule_id}</span>
                      <span className="tabular-nums text-muted-foreground shrink-0">{rule.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </ViewTabPanel>
          ) : null}

          {activeTab === 'pages' ? (
          <ViewTabPanel idPrefix="accessibility" tabId="pages">
            {filteredRows.length === 0 ? (
              <Card className="p-8 text-center">
                <List className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden />
                <p className="text-sm text-muted-foreground">{va.noViolations}</p>
              </Card>
            ) : (
              <Card className="overflow-hidden" devData={pagesTableDevData}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell className="w-8" />
                      <TableHeadCell>{va.colUrl}</TableHeadCell>
                      <TableHeadCell>{va.colCount}</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagination.slice.map((row: FlatAxePageRow) => {
                      const open = expanded === row.id;
                      return (
                        <Fragment key={row.id}>
                          <TableRow>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => setExpanded(open ? null : row.id)}
                                className="p-1 text-muted-foreground hover:text-foreground"
                              >
                                {open ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <span className="font-mono text-xs break-all">{row.url}</span>
                                <UrlInspectorButton url={row.url} />
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums">{row.violationCount}</TableCell>
                          </TableRow>
                          {open ? (
                            <tr className="border-b border-muted/60 bg-brand-900/50">
                              <td colSpan={3} className="px-4 py-3">
                                <ul className="space-y-2 py-2">
                                  {row.violations.map((v, i) => (
                                    <li key={`${v.id}-${i}`} className="text-xs text-muted-foreground">
                                      <span className="font-mono text-foreground">{v.id}</span>
                                      {v.impact ? ` · ${v.impact}` : ''}
                                      {v.description ? ` — ${v.description}` : ''}
                                      {v.nodes != null ? ` (${v.nodes} ${va.nodesLabel})` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="px-4 py-2 text-xs text-muted-foreground border-t border-default">
                  {va.pageOf} {pagination.from}–{pagination.to} {va.of} {pagination.total}
                </p>
              </Card>
            )}
          </ViewTabPanel>
          ) : null}
        </>
      )}
    </PageLayout>
  );
}
