import { useCallback, useEffect, useMemo, useState } from 'react';
import { Accessibility, List } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  AlertBanner,
  Button,
} from '@/components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import { useUrlTab } from '@/hooks/useUrlTab';
import { fetchAuditTool } from '@/lib/fetchAuditTool';
import {
  aggregateAxeRules,
  filterAxeRowsByRule,
  filterAxeRowsBySearch,
  flattenAxePages,
  getAxeScopeInfo,
} from '@/lib/axeViolations';
import { format, strings } from '@/lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import AxePagesTable from '@/components/accessibility/AxePagesTable';
import AxeTopRulesChart from '@/components/accessibility/AxeTopRulesChart';
import type { ViewProps } from '@/types';

const TABS = ['summary', 'pages'] as const;
type TabId = (typeof TABS)[number];

function pipelineHref(searchParams: URLSearchParams): string {
  const q = searchParams.toString();
  return q ? `/pipeline?${q}` : '/pipeline';
}

export default function AccessibilityView({ searchQuery = '' }: ViewProps) {
  const { data } = useReport();
  useSectionData('links');
  const linksReady = useSectionsViewReady(['links']);
  const { propertyId, reportId, contextReady } = useActivePropertyContext();
  const va = strings.views.accessibility;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'summary');
  const [apiSummary, setApiSummary] = useState<Record<string, unknown> | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const scope = useMemo(() => getAxeScopeInfo(data), [data]);
  const allRows = useMemo(() => flattenAxePages(data?.links), [data?.links]);
  const clientRules = useMemo(() => aggregateAxeRules(allRows), [allRows]);

  const ruleFilter = searchParams.get('rule');
  const q = (searchQuery || '').toLowerCase().trim();

  const filteredRows = useMemo(() => {
    let rows = filterAxeRowsBySearch(allRows, q);
    rows = filterAxeRowsByRule(rows, ruleFilter);
    return rows;
  }, [allRows, q, ruleFilter]);

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

  const setRuleFilter = useCallback(
    (ruleId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (ruleId) {
        next.set('rule', ruleId);
        next.set('tab', 'pages');
      } else {
        next.delete('rule');
      }
      const query = next.toString();
      navigate(query ? `${pathname}?${query}` : pathname, {
        replace: true,
        preventScrollReset: true,
      });
      if (ruleId) setActiveTab('pages');
    },
    [navigate, searchParams, setActiveTab],
  );

  const handleRuleClick = useCallback(
    (ruleId: string) => {
      setRuleFilter(ruleId);
    },
    [setRuleFilter],
  );

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
      ruleFilter,
      rowCount: filteredRows.length,
      rows: filteredRows.slice(0, 50).map((row) => ({
        id: row.id,
        url: row.url,
        violationCount: row.violationCount,
      })),
    }),
    [filteredRows, q, ruleFilter],
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
        actions={
          <Link to={pipelineHref(searchParams)} className="text-sm text-link hover:underline">
            {va.pipelineSettingsLink}
          </Link>
        }
      />

      {!scope.usesBrowser ? (
        <AlertBanner variant="warning" className="mb-4">
          <p>
            {va.browserRequiredHint}{' '}
            <Link to={pipelineHref(searchParams)} className="font-medium underline underline-offset-2">
              {va.pipelineSettingsLink}
            </Link>
          </p>
        </AlertBanner>
      ) : allRows.length === 0 ? (
        <AlertBanner variant="info" className="mb-4">
          <p>
            {va.axeEnableHint}{' '}
            <Link to={pipelineHref(searchParams)} className="font-medium underline underline-offset-2">
              {va.pipelineSettingsLink}
            </Link>
          </p>
        </AlertBanner>
      ) : null}

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
                <StatCard
                  label={va.statPages}
                  value={pagesWithViolations}
                  hint={metricHelpHint('views.accessibility.statPages')}
                />
                <StatCard
                  label={va.statViolations}
                  value={totalViolations}
                  hint={metricHelpHint('views.accessibility.statViolations')}
                />
                <StatCard
                  label={va.statRules}
                  value={topRules.length}
                  hint={metricHelpHint('views.accessibility.statRules')}
                />
              </div>
              {summaryError ? (
                <p className="text-xs text-muted-foreground mb-4">{summaryError}</p>
              ) : null}
              <AxeTopRulesChart rules={topRules} devData={topRulesDevData} onRuleClick={handleRuleClick} />
              <Card devData={topRulesDevData}>
                <h3 className="text-sm font-semibold text-foreground mb-3">{va.topRulesTitle}</h3>
                {topRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{va.noViolations}</p>
                ) : (
                  <ul className="space-y-2">
                    {topRules.slice(0, 15).map((rule) => (
                      <li key={String(rule.rule_id)}>
                        <button
                          type="button"
                          onClick={() => handleRuleClick(String(rule.rule_id))}
                          className="flex w-full items-center justify-between text-sm gap-4 rounded-lg px-2 py-1 hover:bg-brand-800/80 text-left"
                        >
                          <span className="font-mono text-xs text-foreground truncate">{rule.rule_id}</span>
                          <span className="tabular-nums text-muted-foreground shrink-0">{rule.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </ViewTabPanel>
          ) : null}

          {activeTab === 'pages' ? (
            <ViewTabPanel idPrefix="accessibility" tabId="pages">
              {ruleFilter ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {format(va.ruleFilterActive, { rule: ruleFilter })}
                  </p>
                  <Button variant="secondary" className="text-xs py-1 px-2" onClick={() => setRuleFilter(null)}>
                    {va.clearRuleFilter}
                  </Button>
                </div>
              ) : null}
              {filteredRows.length === 0 ? (
                <Card className="p-8 text-center">
                  <List className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden />
                  <p className="text-sm text-muted-foreground">{va.noViolations}</p>
                </Card>
              ) : (
                <Card className="overflow-hidden" devData={pagesTableDevData}>
                  <AxePagesTable
                    rows={allRows}
                    searchQuery={q}
                    ruleFilter={ruleFilter}
                  />
                </Card>
              )}
            </ViewTabPanel>
          ) : null}
        </>
      )}
    </PageLayout>
  );
}
