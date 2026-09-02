import { useState, useMemo, useEffect } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import { AlertTriangle, AlertCircle, Info, ExternalLink, Flame, BarChart2, ListChecks } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { useOptionalPipeline } from '../context/PipelineContext';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Badge, ViewTabs, ViewTabPanel, Button, LabelWithHint } from '../components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import { paginateSlice, PAGE_SIZE } from '@/components/google/tableUtils';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import IssueTaskBoard from '@/components/issues/IssueTaskBoard';
import IssueAiFixButton from '@/components/issues/IssueAiFixButton';
import IssuePromptGenerator from '@/components/issues/IssuePromptGenerator';
import IssueTrendChart from '@/components/issues/IssueTrendChart';
import MobileDesktopDelta from '@/components/issues/MobileDesktopDelta';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';
import { doughnutOptionsWithPercentTooltip, formatCompositionAria } from '../lib/chartDoughnutUtils';
import { ChartAccessibleFallback } from '../components/charts';
import type { ReportIssue, ViewProps } from '@/types';
import { categoryDisplayName } from '@/lib/categoryDisplayNames';
import {
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  normalizePriority,
  type PriorityKey,
} from '@/lib/issuePriority';
import { issueDisplayMessage } from '@/lib/issueDisplayMessage';

registerChartJsBase();

const MAX_CATEGORY_CHART = 12;

const PRIORITY_ICONS: Record<PriorityKey, typeof Flame> = {
  Critical: Flame,
  High: AlertTriangle,
  Medium: AlertCircle,
  Low: Info,
};

interface CategoryIssueItem {
  category: string;
  issue: ReportIssue;
}

interface IssueCardProps {
  item: CategoryIssueItem;
  vi: (typeof strings.views)['issues'];
  emDash: string;
}

function issueItemDevPayload(item: CategoryIssueItem) {
  return {
    category: item.category,
    categoryLabel: categoryDisplayName(item.category),
    issue: item.issue,
  };
}

function IssueCard({ item, vi, emDash }: IssueCardProps) {
  const iss = item.issue;
  const p = normalizePriority(iss.priority);
  const cfg = PRIORITY_CONFIG[p];
  const Icon = PRIORITY_ICONS[p];
  const devData = {
    widget: 'issues.issueCard',
    priority: p,
    ...issueItemDevPayload(item),
  };
  return (
    <div
      className={`relative group/dev-card bg-brand-800 border border-default rounded-xl border-l-4 ${cfg.border} flex flex-col md:flex-row gap-4 p-5 hover:border-brand-700/80 transition-colors min-w-0 max-w-full overflow-hidden`}
    >
      <DevCopyJsonButton data={devData} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.text}`} />
          <Badge value={p} />
          <span className="text-xs text-muted-foreground font-medium">{categoryDisplayName(item.category)}</span>
        </div>
        <h3 className="text-foreground font-medium text-sm leading-snug">
          {issueDisplayMessage(iss.message) || emDash}
        </h3>
        {iss.url && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={iss.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-link text-xs hover:underline break-all"
            >
              {iss.url}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
            <UrlInspectorButton url={iss.url} />
          </div>
        )}
        {iss.impact_score != null && Number(iss.impact_score) > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            <LabelWithHint label="Impact score" helpKey="shared.impactScore" />:{' '}
            <span className="font-semibold text-foreground">{Number(iss.impact_score).toLocaleString()}</span>
          </p>
        ) : null}
      </div>
      <div className="flex-1 min-w-0 bg-brand-900 rounded-lg p-3 border border-muted space-y-2">
        <div className="text-xs text-link font-bold uppercase mb-1 tracking-wide">{vi.fixRecommendation}</div>
        <p className="text-muted-foreground text-sm leading-relaxed break-words">
          {iss.llm_recommendation || iss.recommendation || emDash}
        </p>
        {iss.llm_recommendation && iss.recommendation && iss.llm_recommendation !== iss.recommendation ? (
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            <span className="font-semibold">{vi.ruleRecommendation}: </span>
            {iss.recommendation}
          </p>
        ) : null}
        <IssueAiFixButton issue={iss} category={item.category} />
      </div>
    </div>
  );
}

export default function Issues({ searchQuery = '' }: ViewProps) {
  const { data, selectedReportId } = useReport();
  const domain = data?.site_name || '';
  useSectionData('issues');
  useSectionData('traffic');
  const issuesReady = useSectionsViewReady(['issues']);
  const pipeline = useOptionalPipeline();
  const propertyId = Number(pipeline?.configState.active_property_id || 0) || null;
  const vi = strings.views.issues;
  const vlp = vi.pagination;
  const sj = strings.common;
  const priorityOrder = PRIORITY_ORDER;
  const [issuesTab, setIssuesTab] = useState<'audit' | 'board'>('audit');
  const [priorityFilter, setPriorityFilter] = useState(sj.all);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [issuePage, setIssuePage] = useState(1);

  const clicksByUrl = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.google?.gsc?.top_pages || []) {
      const url = String(row.page || '').replace(/\/$/, '');
      if (url) map.set(url, Number(row.clicks) || 0);
    }
    return map;
  }, [data?.google?.gsc?.top_pages]);

  const q = (searchQuery || '').toLowerCase().trim();

  const allIssuesList = useMemo((): CategoryIssueItem[] => {
    const acc: CategoryIssueItem[] = [];
    (data?.categories || []).forEach((cat) => {
      (cat.issues || []).forEach((iss: ReportIssue) => {
        acc.push({ category: cat.name || cat.id || '', issue: iss });
      });
    });
    return acc;
  }, [data]);

  const list = useMemo((): CategoryIssueItem[] => {
    const acc: CategoryIssueItem[] = [];
    (data?.categories || []).forEach((cat) => {
      (cat.issues || []).forEach((iss: ReportIssue) => {
        acc.push({ category: cat.name || cat.id || '', issue: iss });
      });
    });
    if (!q) return acc;
    return acc.filter((item) => {
      const msg = (item.issue.message || '').toLowerCase();
      const url = (item.issue.url || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      const rec = (item.issue.recommendation || '').toLowerCase();
      return msg.includes(q) || url.includes(q) || cat.includes(q) || rec.includes(q);
    });
  }, [data, q]);

  const forCharts = list;

  const { categoryChartLabels, categoryChartValues } = useMemo(() => {
    const m = new Map();
    forCharts.forEach((item) => {
      const c = item.category || sj.uncategorized;
      m.set(c, (m.get(c) || 0) + 1);
    });
    const pairs = [...m.entries()].sort((a, b) => b[1] - a[1]);
    if (pairs.length <= MAX_CATEGORY_CHART) {
      return {
        categoryChartLabels: pairs.map((p) => categoryDisplayName(p[0])),
        categoryChartValues: pairs.map((p) => p[1]),
      };
    }
    const top = pairs.slice(0, MAX_CATEGORY_CHART - 1);
    const rest = pairs.slice(MAX_CATEGORY_CHART - 1).reduce((s, [, n]) => s + n, 0);
    return {
      categoryChartLabels: [...top.map((p) => categoryDisplayName(p[0])), sj.other],
      categoryChartValues: [...top.map((p) => p[1]), rest],
    };
  }, [forCharts, sj]);

  const priorityChart = useMemo(() => {
    const items = priorityOrder.map((p) => ({
      label: p,
      value: forCharts.filter((item) => normalizePriority(item.issue.priority) === p).length,
      color: PRIORITY_CONFIG[p].chartColor,
    })).filter((item) => item.value > 0);
    return {
      labels: items.map((i) => i.label),
      values: items.map((i) => i.value),
      colors: items.map((i) => i.color),
      aria: formatCompositionAria(
        items.map((i) => i.label),
        items.map((i) => i.value),
        vi.issuesWord,
      ),
      rows: items.map((i) => [i.label, i.value] as [string, string | number]),
    };
  }, [forCharts, priorityOrder, vi.issuesWord]);

  const priorityCounts = priorityOrder.reduce<Record<string, number>>((acc, p) => {
    acc[p] = list.filter((item) => normalizePriority(item.issue.priority) === p).length;
    return acc;
  }, {});


  // Copy before sorting: `list` is a memoized array; sorting it in place would
  // mutate the memoized value during render and reorder other consumers.
  let filtered = [...list];
  if (priorityFilter !== sj.all) {
    filtered = filtered.filter((item) => normalizePriority(item.issue.priority) === priorityFilter);
  }

  filtered.sort((a, b) => {
    const aImpact = Number(a.issue.impact_score) || 0;
    const bImpact = Number(b.issue.impact_score) || 0;
    if (bImpact !== aImpact) return bImpact - aImpact;
    const aClicks = Number(a.issue.gsc_clicks) || clicksByUrl.get(String(a.issue.url || '').replace(/\/$/, '')) || 0;
    const bClicks = Number(b.issue.gsc_clicks) || clicksByUrl.get(String(b.issue.url || '').replace(/\/$/, '')) || 0;
    if (bClicks !== aClicks) return bClicks - aClicks;
    const ao = PRIORITY_CONFIG[normalizePriority(a.issue.priority)].order;
    const bo = PRIORITY_CONFIG[normalizePriority(b.issue.priority)].order;
    return ao - bo;
  });

  const taskBoardIssues = useMemo(
    () =>
      list.map((item) => ({
        ...item,
        clicks: clicksByUrl.get(String(item.issue.url || '').replace(/\/$/, '')) || 0,
      })),
    [list, clicksByUrl],
  );

  const grouped = filtered.reduce<Record<string, CategoryIssueItem[]>>((acc, item) => {
    const cat = item.category || sj.uncategorized;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryTabs = useMemo(
    () =>
      Object.entries(grouped)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([cat, items]) => ({
          id: cat,
          label: categoryDisplayName(cat),
          badge: items.length,
        })),
    [grouped],
  );

  const resolvedCategory =
    activeCategory && grouped[activeCategory] ? activeCategory : categoryTabs[0]?.id ?? '';

  const activeItems = grouped[resolvedCategory] || [];

  const {
    slice: visibleIssues,
    page: safePage,
    totalPages,
    total: activeTotal,
    from,
    to,
  } = useMemo(() => paginateSlice(activeItems, issuePage, PAGE_SIZE), [activeItems, issuePage]);

  useEffect(() => {
    setIssuePage(1);
  }, [resolvedCategory, priorityFilter, q]);

  const categoryBarOpts = useMemo(() => {
    const base = barOptionsHorizontal(undefined, categoryChartLabels);
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} ${n !== 1 ? vi.issuesWord : vi.issueWord}`;
            },
          },
        },
      },
    };
  }, [vi, categoryChartLabels]);

  const categoryChartDevData = useMemo(
    () => ({
      widget: 'issues.charts.byCategory',
      title: vi.issuesByCategory,
      hint: vi.issuesByCategoryHint,
      labels: categoryChartLabels,
      values: categoryChartValues,
    }),
    [categoryChartLabels, categoryChartValues, vi.issuesByCategory, vi.issuesByCategoryHint],
  );

  const priorityChartDevData = useMemo(
    () => ({
      widget: 'issues.charts.byPriority',
      title: vi.issuesByPriority,
      hint: vi.issuesByPriorityHint,
      labels: priorityChart.labels,
      values: priorityChart.values,
      colors: priorityChart.colors,
      rows: priorityChart.rows,
    }),
    [priorityChart, vi.issuesByPriority, vi.issuesByPriorityHint],
  );

  const priorityStatsDevData = useMemo(
    () => ({
      widget: 'issues.priorityStats',
      counts: priorityCounts,
      activeFilter: priorityFilter,
    }),
    [priorityCounts, priorityFilter],
  );

  const issueListDevData = useMemo(
    () => ({
      widget: 'issues.list',
      domain,
      priorityFilter,
      searchQuery: q,
      resolvedCategory,
      categoryTabs: categoryTabs.map((t) => ({ id: t.id, label: t.label, count: t.badge })),
      pagination: {
        page: safePage,
        totalPages,
        from,
        to,
        total: activeTotal,
        pageSize: PAGE_SIZE,
      },
      visibleIssues: visibleIssues.map(issueItemDevPayload),
      filteredCount: filtered.length,
    }),
    [
      activeTotal,
      categoryTabs,
      domain,
      filtered.length,
      from,
      priorityFilter,
      q,
      resolvedCategory,
      safePage,
      to,
      totalPages,
      visibleIssues,
    ],
  );

  const issuesPageDevData = useMemo(
    () => ({
      widget: 'issues.page',
      domain,
      reportId: selectedReportId,
      issuesTab,
      totalIssues: list.length,
      priorityCounts,
      priorityFilter,
      searchQuery: q,
      showCharts: list.length > 0 && forCharts.length > 0,
    }),
    [
      domain,
      forCharts.length,
      issuesTab,
      list.length,
      priorityCounts,
      priorityFilter,
      q,
      selectedReportId,
    ],
  );

  if (!issuesReady) {
    return <ViewSectionLoading title={vi.title} />;
  }

  const showCharts = list.length > 0 && forCharts.length > 0;
  const subtitle = `${vi.subtitlePrefix} ${format(vi.subtitleTotal, {
    count: list.length,
    issuesWord: list.length === 1 ? vi.issueWord : vi.issuesWord,
  })}`;

  return (
    <PageLayout className="space-y-6 min-w-0 max-w-full">
      <div className="relative group/dev-card">
        <DevCopyJsonButton data={issuesPageDevData} className="top-0 right-0" />
      <PageHeader
        title={vi.title}
        subtitle={subtitle}
        actions={
          allIssuesList.length > 0 ? (
            <IssuePromptGenerator
              domain={domain}
              items={allIssuesList}
              reportId={selectedReportId}
              propertyId={propertyId}
            />
          ) : null
        }
      />
      </div>

      <ViewTabs
        tabs={[
          { id: 'audit', label: vi.tabAudit || 'Audit issues', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
          { id: 'board', label: vi.tabBoard || 'Task board', icon: <ListChecks className="h-3.5 w-3.5" /> },
        ]}
        activeTab={issuesTab}
        onChange={(id) => setIssuesTab(id as 'audit' | 'board')}
        ariaLabel={vi.title}
        idPrefix="issues"
      />

      {issuesTab === 'board' ? (
        <IssueTaskBoard
          propertyId={propertyId}
          reportId={selectedReportId}
          issues={taskBoardIssues}
        />
      ) : null}

      {issuesTab === 'audit' && domain ? <IssueTrendChart domain={domain} /> : null}
      {issuesTab === 'audit' && data?.crawl_run_id ? (
        <MobileDesktopDelta runId={data.crawl_run_id} />
      ) : null}

      {issuesTab === 'audit' && showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
          <Card padding="tight" shadow overflowHidden devData={categoryChartDevData} className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-4 w-4 text-link" />
              <h2 className="text-sm font-bold text-foreground">{vi.issuesByCategory}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{vi.issuesByCategoryHint}</p>
            <div className="relative h-64 min-w-0 w-full overflow-hidden">
              <Bar
                data={{
                  labels: categoryChartLabels,
                  datasets: [{ data: categoryChartValues, backgroundColor: palette(categoryChartLabels.length) }],
                }}
                options={categoryBarOpts}
              />
            </div>
          </Card>
          <Card padding="tight" shadow overflowHidden devData={priorityChartDevData} className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-4 w-4 text-link" />
              <h2 className="text-sm font-bold text-foreground">{vi.issuesByPriority}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{vi.issuesByPriorityHint}</p>
            <div className="h-64 flex items-center justify-center min-w-0 overflow-hidden">
              <div className="w-full max-w-[280px] h-52 min-w-0">
                <ChartAccessibleFallback summary={priorityChart.aria} rows={priorityChart.rows}>
                  <Doughnut
                    data={{
                      labels: priorityChart.labels,
                      datasets: [
                        {
                          data: priorityChart.values,
                          backgroundColor: priorityChart.colors,
                          borderColor: 'rgba(15,23,42,0.8)',
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={doughnutOptionsWithPercentTooltip({
                      plugins: {
                        tooltip: {
                          callbacks: {
                            label: (ctx: TooltipItem<'doughnut'>) => {
                              const n = Number(ctx.raw);
                              return ` ${ctx.label}: ${n.toLocaleString()} ${n !== 1 ? vi.issuesWord : vi.issueWord}`;
                            },
                          },
                        },
                      },
                    })}
                  />
                </ChartAccessibleFallback>
              </div>
            </div>
          </Card>
        </div>
      )}

      {issuesTab === 'audit' && (
      <div className="relative group/dev-card min-w-0">
        <DevCopyJsonButton data={priorityStatsDevData} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {priorityOrder.map((p) => {
            const cfg = PRIORITY_CONFIG[p];
            const Icon = PRIORITY_ICONS[p];
            const count = priorityCounts[p] || 0;
            return (
              <Card
                key={p}
                shadow
                devData={{
                  widget: 'issues.priorityStat',
                  priority: p,
                  count,
                  active: priorityFilter === p,
                }}
                className={`cursor-pointer transition-all ${
                  priorityFilter === p ? `${cfg.ring || 'ring-1 ring-brand-700/30'} border-brand-700` : 'hover:border-brand-700'
                }`}
                onClick={() => setPriorityFilter((prev) => (prev === p ? sj.all : p))}
              >
                <div className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${cfg.text}`}>
                  <Icon className="h-4 w-4" /> {p}
                </div>
                <div className={`text-3xl font-bold ${count > 0 ? cfg.text : 'text-muted-foreground'}`}>{count}</div>
              </Card>
            );
          })}
        </div>
      </div>
      )}

      {issuesTab === 'audit' && (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPriorityFilter(sj.all)}
          className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${
            priorityFilter === sj.all
              ? 'bg-blue-500/20 text-link border-blue-500/30'
              : 'border-default bg-brand-800 text-muted-foreground hover:border-brand-700/80'
          }`}
        >
          {vi.allPriorities}
        </button>
        {priorityOrder.map((p) => {
          const cfg = PRIORITY_CONFIG[p];
          const active = priorityFilter === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter((prev) => (prev === p ? sj.all : p))}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                active
                  ? `${cfg.bg} ${cfg.text} border-current/30`
                  : 'border-default bg-brand-800 text-muted-foreground hover:border-brand-700/80'
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
      )}

      {issuesTab === 'audit' && (filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 gap-3">
          <Info className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{vi.noMatches}</p>
        </Card>
      ) : (
        <div className="relative group/dev-card space-y-4 min-w-0 max-w-full">
          <DevCopyJsonButton data={issueListDevData} />
          {categoryTabs.length > 1 ? (
            <ViewTabs
              tabs={categoryTabs}
              activeTab={resolvedCategory}
              onChange={(id) => setActiveCategory(id)}
              ariaLabel={vi.allCategories}
              idPrefix="issues-category"
            />
          ) : null}
          <ViewTabPanel idPrefix="issues-category" tabId={resolvedCategory} className="space-y-3">
            {visibleIssues.map((item, i) => (
              <IssueCard key={`${resolvedCategory}-${safePage}-${i}`} item={item} vi={vi} emDash={sj.emDash} />
            ))}
          </ViewTabPanel>
          {activeTotal > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pt-1">
              <div className="text-sm text-muted-foreground space-y-0.5">
                <div>{format(vlp.showingSlice, { from, to, total: activeTotal })}</div>
                <div className="text-xs">
                  {vlp.pageOf}{' '}
                  <span className="font-bold text-bright tabular-nums">{safePage}</span> {vlp.of}{' '}
                  <span className="font-bold text-bright tabular-nums">{totalPages}</span>
                  <span className="text-muted-foreground ml-2">
                    ({format(vlp.rowsPerPage, { n: PAGE_SIZE })})
                  </span>
                </div>
              </div>
              {totalPages > 1 ? (
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => setIssuePage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                  >
                    {vlp.previous}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setIssuePage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                  >
                    {vlp.next}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </PageLayout>
  );
}
