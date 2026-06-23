
import type { Chart, TooltipItem } from 'chart.js';
import { Fragment, useState, useMemo, useEffect } from 'react';
import { useUrlTab } from '@/hooks/useUrlTab';
import { useTabSections } from '@/hooks/useTabSections';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { shouldBlockViewForSections } from '@/lib/reportViewSections';
import type {
  ContentAnalyticsData,
  TextContentAnalysisData,
  TextContentKeywordEntry,
  TopicCluster,
  ViewProps,
} from '@/types';
import { filterTopicClusters } from '@/lib/semanticTextHygiene';
import { buildByPageTextRows } from '@/lib/textContentAnalysis';
import { anyChartOptions } from '../utils/chartOptions';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  BookOpen,
  FileText,
  BarChart2,
  Tag,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Key,
  AlignLeft,
  Globe,
} from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import {
  PageLayout,
  PageHeader,
  Card,
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
  ViewTabs,
  ViewTabPanel,
  Button,
  SectionHeader,
  ChartTitleWithHint,
} from '../components';
import type { ViewTabItem } from '../components';
import SortablePaginatedTable from '../components/google/SortablePaginatedTable';
import { PAGE_SIZE, paginateSlice } from '../components/google/tableUtils';
import { palette, PALETTE_CATEGORICAL } from '../utils/chartPalette';
import {
  getGridColor,
  getChartTitleColor,
  getChartCanvasTextColor,
  truncateChartLabel,
} from '../utils/chartJsDefaults';
import { ChartPanel } from '../components/charts';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const TEXT_TABS = ['overview', 'keywords', 'analytics', 'topics'] as const;
type TextTabId = (typeof TEXT_TABS)[number];

const EMPTY_CA: ContentAnalyticsData = {};
const EMPTY_TCA: TextContentAnalysisData = {};

const barValueLabelsPlugin = {
  id: 'tcaBarLabels',
  afterDatasetsDraw(chart: Chart) {
    const ctx = chart.ctx;
    const isHorizontal = chart.options.indexAxis === 'y';
    const pad = 6;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    (chart.data.datasets || []).forEach((dataset, dsi: number) => {
      const meta = chart.getDatasetMeta(dsi);
      if (!meta?.data?.length || !dataset?.data) return;
      meta.data.forEach((bar, i: number) => {
        const value = dataset.data[i];
        if (value == null || value === 0) return;
        const label = Number(value).toLocaleString();
        if (isHorizontal) {
          const textWidth = ctx.measureText(label).width;
          const fitsOutside = bar.x + pad + textWidth <= chart.chartArea.right;
          if (fitsOutside) {
            ctx.textAlign = 'left';
            ctx.fillStyle = getChartCanvasTextColor();
            ctx.fillText(label, bar.x + pad, bar.y);
          } else {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, bar.x - pad, bar.y);
          }
        } else {
          ctx.textAlign = 'center';
          ctx.fillStyle = getChartCanvasTextColor();
          ctx.fillText(label, bar.x, bar.y - 12);
        }
      });
    });
    ctx.restore();
  },
};

function barOpts(xTitle?: string) {
  const pagesWord = strings.common.pages;
  return anyChartOptions({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: getGridColor() }, ...(xTitle ? { title: { display: true, text: xTitle } } : {}) },
      y: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: pagesWord } },
    },
  });
}

function barOptsH(xTitle?: string, yAxisLabels?: readonly string[]) {
  const freq = strings.charts.axisFrequency;
  const yScale: Record<string, unknown> = { grid: { color: getGridColor() } };
  if (yAxisLabels?.length) {
    yScale.ticks = {
      callback: (_value: unknown, index: number) => {
        const label = yAxisLabels[index];
        return label ? truncateChartLabel(String(label)) : '';
      },
    };
  }
  return anyChartOptions({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        grace: '10%',
        title: { display: true, text: xTitle ?? freq },
      },
      y: yScale,
    },
  });
}

function KeywordIndexTable({
  rows,
  vtca,
  sj,
}: {
  rows: TextContentKeywordEntry[];
  vtca: (typeof strings.views)['textContentAnalysis'];
  sj: typeof strings.common;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (word: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{vtca.noKeywordData}</p>;
  }

  return (
    <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-muted">
      <Table>
        <TableHead sticky>
          <tr>
            <TableHeadCell className="w-8" />
            <TableHeadCell hint={metricHelpHint('views.textContentAnalysis.thWord')}>{vtca.thWord}</TableHeadCell>
            <TableHeadCell className="text-right w-28" hint={metricHelpHint('views.textContentAnalysis.thTotalCount')}>
              {vtca.thTotalCount}
            </TableHeadCell>
            <TableHeadCell className="text-right w-24" hint={metricHelpHint('views.textContentAnalysis.thPageCount')}>
              {vtca.thPageCount}
            </TableHeadCell>
          </tr>
        </TableHead>
        <TableBody striped>
          {rows.map((row) => {
            const hasPages = (row.top_pages?.length ?? 0) > 0;
            const isOpen = expanded.has(row.word);
            return (
              <Fragment key={row.word}>
                <TableRow>
                  <TableCell className="w-8">
                    {hasPages ? (
                      <button
                        type="button"
                        onClick={() => toggle(row.word)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? vtca.collapsePages : vtca.expandPages}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{row.word}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.total_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.page_count.toLocaleString()}</TableCell>
                </TableRow>
                {isOpen && hasPages ? (
                  <TableRow>
                    <td colSpan={4} className="bg-brand-900/40 py-2 px-3">
                      <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                        {vtca.thTopPages}
                      </div>
                      <ul className="space-y-1">
                        {row.top_pages!.map((p) => (
                          <li key={p.url} className="flex justify-between gap-2 text-xs">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-link truncate hover:underline"
                            >
                              {p.url}
                            </a>
                            <span className="font-mono tabular-nums text-muted-foreground shrink-0">{p.count}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TextContentAnalysis({ searchQuery = '' }: ViewProps) {
  const vtca = strings.views.textContentAnalysis;
  const sj = strings.common;
  const ch = strings.charts;
  const { data } = useReport();
  const [activeTab, setActiveTab] = useUrlTab(TEXT_TABS, 'overview');
  const sectionStatus = useTabSections(['content', 'indexation', 'keywords'], true);
  const [keywordsChartPage, setKeywordsChartPage] = useState(1);

  const tca: TextContentAnalysisData = data?.text_content_analysis ?? EMPTY_TCA;
  const ca: ContentAnalyticsData = data?.content_analytics ?? EMPTY_CA;
  const vocab = tca.vocabulary_stats ?? {};
  const wcStats = ca.word_count_stats ?? {};
  const keywordIndex = tca.keyword_index ?? [];

  const keywordIndexFiltered = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return keywordIndex;
    return keywordIndex.filter(
      (k) =>
        k.word.toLowerCase().includes(q) ||
        (k.top_pages ?? []).some((p) => p.url.toLowerCase().includes(q)),
    );
  }, [keywordIndex, searchQuery]);

  const keywordsChartPagination = useMemo(
    () => paginateSlice(keywordIndexFiltered, keywordsChartPage, PAGE_SIZE),
    [keywordIndexFiltered, keywordsChartPage],
  );

  useEffect(() => {
    setKeywordsChartPage(1);
  }, [keywordIndexFiltered]);

  useEffect(() => {
    setKeywordsChartPage((p) => Math.min(Math.max(1, p), keywordsChartPagination.totalPages));
  }, [keywordsChartPagination.totalPages]);

  const keywordsChart = useMemo(() => {
    const slice = keywordsChartPagination.slice;
    if (slice.length === 0) return null;
    return {
      labels: slice.map((k) => k.word),
      values: slice.map((k) => k.total_count),
    };
  }, [keywordsChartPagination.slice]);

  const keywordsChartHeightPx = keywordsChart
    ? Math.max(320, keywordsChart.labels.length * 28)
    : 320;

  const histChart = useMemo(() => {
    const hist = tca.keyword_frequency_histogram;
    if (!hist) return null;
    const labels = [vtca.histBucket1, vtca.histBucket2, vtca.histBucket6, vtca.histBucket21];
    const keys = ['1', '2-5', '6-20', '21+'];
    const values = keys.map((k) => Number(hist[k]) || 0);
    if (values.every((v) => v === 0)) return null;
    return { labels, values };
  }, [tca.keyword_frequency_histogram, vtca]);

  const byPageRows = useMemo(
    () => buildByPageTextRows(data?.links, searchQuery),
    [data?.links, searchQuery],
  );

  const languageMlChart = useMemo(() => {
    const c = data?.language_summary?.counts || {};
    const entries = Object.entries(c)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 15);
    if (entries.length === 0) return null;
    return { labels: entries.map((x) => x[0]), values: entries.map((x) => Number(x[1])) };
  }, [data?.language_summary?.counts]);

  const nerSiteChart = useMemo(() => {
    const lc = data?.ner_site_summary?.label_counts;
    if (!lc || typeof lc !== 'object') return null;
    const entries = Object.entries(lc)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 15);
    if (entries.length === 0) return null;
    return { labels: entries.map((x) => x[0]), values: entries.map((x) => Number(x[1])) };
  }, [data?.ner_site_summary?.label_counts]);

  const tokenClusters = useMemo(
    () => filterTopicClusters(data?.keyword_opportunities?.token_topic_clusters ?? []),
    [data?.keyword_opportunities?.token_topic_clusters],
  );

  const semanticClusters = useMemo(
    () => filterTopicClusters(data?.semantic_keyword_clusters ?? []),
    [data?.semantic_keyword_clusters],
  );

  const wcDist = ca.word_count_distribution ?? {};
  const rlDist = ca.reading_level_distribution ?? {};
  const crDist = ca.content_ratio_distribution ?? {};
  const wcLabels = Object.keys(wcDist);
  const wcValues = Object.values(wcDist).map(Number);
  const rlLabels = Object.keys(rlDist);
  const rlValues = Object.values(rlDist).map(Number);
  const crLabels = Object.keys(crDist);
  const crValues = Object.values(crDist).map(Number);

  const wcPercLabels = vtca.wcPercLabels;
  const wcPercRaw = [wcStats.min, wcStats.p25, wcStats.median, wcStats.mean, wcStats.p75, wcStats.max];
  const wcPercValues = wcPercRaw.map((v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null));
  const hasWcPercBar = wcPercValues.every((v) => v != null) && (wcStats.max ?? 0) > 0;

  const tabItems = useMemo((): ViewTabItem[] => [
    { id: 'overview', label: vtca.tabs.overview, icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
    { id: 'keywords', label: vtca.tabs.keywords, icon: <Key className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
    { id: 'analytics', label: vtca.tabs.analytics, icon: <BarChart2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
    { id: 'topics', label: vtca.tabs.topics, icon: <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
  ], [vtca.tabs]);

  const byPageColumns = useMemo(
    () => [
      { key: 'url', label: vtca.thUrl },
      { key: 'word_count', label: vtca.thWords },
      { key: 'reading_level', label: vtca.thReading },
      { key: 'top_terms', label: vtca.thTopTerms },
    ],
    [vtca],
  );

  if (shouldBlockViewForSections(['content', 'indexation', 'keywords'], sectionStatus, data)) {
    return <ViewSectionLoading title={vtca.title} />;
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader title={vtca.title} subtitle={vtca.subtitle} />

      <ViewTabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as TextTabId)}
        ariaLabel={vtca.title}
        idPrefix="text-content-analysis"
      />

      {activeTab === 'overview' && (
        <ViewTabPanel idPrefix="text-content-analysis" tabId="overview" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card shadow>
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">{vtca.uniqueTerms}</div>
              <div className="text-3xl font-bold text-bright">{vocab.unique_terms ?? sj.emDash}</div>
            </Card>
            <Card shadow>
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">{vtca.pagesWithKeywords}</div>
              <div className="text-3xl font-bold text-bright">{vocab.pages_with_keywords ?? sj.emDash}</div>
            </Card>
            <Card shadow>
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> {vtca.meanWords}
              </div>
              <div className="text-3xl font-bold text-bright">
                {wcStats.mean != null ? Math.round(wcStats.mean).toLocaleString() : sj.emDash}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{vtca.perPage}</div>
            </Card>
            <Card shadow>
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" /> {vtca.medianWords}
              </div>
              <div className="text-3xl font-bold text-bright">
                {wcStats.median != null ? Math.round(wcStats.median).toLocaleString() : sj.emDash}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{vtca.perPage}</div>
            </Card>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
            <Card shadow>
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">{vtca.avgTermsPerPage}</div>
              <div className="text-2xl font-bold text-bright">{vocab.avg_terms_per_page ?? sj.emDash}</div>
            </Card>
            <Card shadow>
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">{vtca.totalOccurrences}</div>
              <div className="text-2xl font-bold text-bright">
                {vocab.total_term_occurrences != null ? vocab.total_term_occurrences.toLocaleString() : sj.emDash}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <SectionHeader icon={AlignLeft} title={vtca.byPageTitle} description={vtca.byPageDesc} helpKey="views.textContentAnalysis.byPageSection" size="sm" />
            <SortablePaginatedTable
              columns={byPageColumns}
              rows={byPageRows}
              defaultSort="word_count"
              defaultDir="desc"
              rowKeyField="url"
              emptyMessage={sj.noData}
              paginationLabels={vtca.pagination}
            />
          </div>
        </ViewTabPanel>
      )}

      {activeTab === 'keywords' && (
        <ViewTabPanel idPrefix="text-content-analysis" tabId="keywords" className="space-y-6">
          {histChart ? (
            <Card padding="tight" shadow>
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="h-4 w-4 text-link" />
                <h3 className="text-sm font-bold text-foreground">{vtca.keywordFrequencyHist}</h3>
              </div>
              <ChartPanel>
                <Bar
                  data={{
                    labels: histChart.labels,
                    datasets: [{ data: histChart.values, backgroundColor: palette(histChart.labels.length) }],
                  }}
                  options={barOpts(ch.axisCount)}
                  plugins={[barValueLabelsPlugin]}
                />
              </ChartPanel>
            </Card>
          ) : null}

          <Card padding="default" shadow>
            <KeywordIndexTable rows={keywordIndexFiltered} vtca={vtca} sj={sj} />
          </Card>
        </ViewTabPanel>
      )}

      {activeTab === 'analytics' && (
        <ViewTabPanel idPrefix="text-content-analysis" tabId="analytics" className="space-y-6">
          {keywordsChart ? (
            <Card padding="tight" shadow>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-link" />
                  <h3 className="text-sm font-bold text-foreground">{vtca.topKeywordsChart}</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {keywordsChartPagination.total.toLocaleString()} terms
                </p>
              </div>
              <ChartPanel heightClass="" style={{ height: keywordsChartHeightPx }}>
                <Bar
                  data={{
                    labels: keywordsChart.labels,
                    datasets: [{ data: keywordsChart.values, backgroundColor: PALETTE_CATEGORICAL[0] }],
                  }}
                  options={barOptsH(ch.axisCount, keywordsChart.labels)}
                  plugins={[barValueLabelsPlugin]}
                />
              </ChartPanel>
              {keywordsChartPagination.total > 0 ? (
                <div className="mt-3 pt-3 border-t border-default flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <div>
                      {format(vtca.pagination.showingSlice, {
                        from: keywordsChartPagination.from,
                        to: keywordsChartPagination.to,
                        total: keywordsChartPagination.total,
                      })}
                    </div>
                    <div className="text-xs">
                      {vtca.pagination.pageOf}{' '}
                      <span className="font-bold text-bright tabular-nums">{keywordsChartPagination.page}</span>{' '}
                      {vtca.pagination.of}{' '}
                      <span className="font-bold text-bright tabular-nums">{keywordsChartPagination.totalPages}</span>
                      <span className="text-muted-foreground ml-2">
                        ({format(vtca.pagination.rowsPerPage, { n: PAGE_SIZE })})
                      </span>
                    </div>
                  </div>
                  {keywordsChartPagination.totalPages > 1 ? (
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => setKeywordsChartPage((p) => Math.max(1, p - 1))}
                        disabled={keywordsChartPagination.page <= 1}
                        className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                      >
                        {vtca.pagination.previous}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setKeywordsChartPage((p) => Math.min(keywordsChartPagination.totalPages, p + 1))
                        }
                        disabled={keywordsChartPagination.page >= keywordsChartPagination.totalPages}
                        className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                      >
                        {vtca.pagination.next}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">{vtca.noKeywordData}</p>
          )}

          <SectionHeader icon={BarChart2} title={vtca.tabs.analytics} helpKey="views.textContentAnalysis.analyticsSection" size="sm" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
            <Card padding="tight">
              <ChartTitleWithHint title={vtca.wordCountDist} helpKey="views.textContentAnalysis.wordCountDist" />
              <ChartPanel heightClass="h-64">
                {wcLabels.length > 0 ? (
                  <Bar
                    data={{ labels: wcLabels, datasets: [{ data: wcValues, backgroundColor: palette(wcLabels.length) }] }}
                    options={barOpts(ch.axisWordCount)}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
                )}
              </ChartPanel>
            </Card>

            <Card padding="tight">
              <ChartTitleWithHint title={vtca.readingLevelDist} helpKey="views.textContentAnalysis.readingLevelDist" />
              <ChartPanel heightClass="h-64">
                {rlLabels.length > 0 ? (
                  <Bar
                    data={{
                      labels: rlLabels,
                      datasets: [{ data: rlValues, backgroundColor: ['#22C55E', '#4C72B0', '#EAB308', '#EF4444'].slice(0, rlLabels.length) }],
                    }}
                    options={{
                      ...barOptsH(undefined, rlLabels),
                      plugins: {
                        ...barOptsH(undefined, rlLabels).plugins,
                        tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw} pages` } },
                      },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
                )}
              </ChartPanel>
            </Card>

            <Card padding="tight">
              <ChartTitleWithHint title={vtca.contentHtmlRatio} helpKey="views.textContentAnalysis.contentHtmlRatio" />
              <ChartPanel heightClass="h-64">
                {crLabels.length > 0 ? (
                  <Bar
                    data={{ labels: crLabels, datasets: [{ data: crValues, backgroundColor: palette(crLabels.length) }] }}
                    options={barOpts(ch.ratio)}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
                )}
              </ChartPanel>
            </Card>

            {hasWcPercBar ? (
              <Card padding="tight">
                <ChartTitleWithHint title={vtca.wordCountLadder} helpKey="views.textContentAnalysis.wordCountLadder" />
                <ChartPanel>
                  <Bar
                    data={{
                      labels: wcPercLabels,
                      datasets: [
                        {
                          data: wcPercValues,
                          backgroundColor: ['#64748B', '#EAB308', '#3B82F6', '#A855F7', '#22C55E', '#F97316'],
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { color: getGridColor() }, title: { display: true, text: ch.statistic, color: getChartTitleColor() } },
                        y: {
                          grid: { color: getGridColor() },
                          beginAtZero: true,
                          title: { display: true, text: ch.axisWordCount, color: getChartTitleColor() },
                        },
                      },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                </ChartPanel>
              </Card>
            ) : null}
          </div>
        </ViewTabPanel>
      )}

      {activeTab === 'topics' && (
        <ViewTabPanel idPrefix="text-content-analysis" tabId="topics" className="space-y-6">
          {languageMlChart ? (
            <Card padding="tight" shadow>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                <h3 className="text-sm font-bold text-foreground">{vtca.languageMix}</h3>
              </div>
              <ChartPanel>
                <Bar
                  data={{
                    labels: languageMlChart.labels,
                    datasets: [{ label: sj.pages, data: languageMlChart.values, backgroundColor: palette(languageMlChart.labels.length) }],
                  }}
                  options={barOpts(sj.pages)}
                />
              </ChartPanel>
            </Card>
          ) : null}

          {nerSiteChart ? (
            <Card padding="tight" shadow>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-cyan-700 dark:text-cyan-400" />
                <h3 className="text-sm font-bold text-foreground">{vtca.entityLabels}</h3>
              </div>
              <ChartPanel>
                <Bar
                  data={{
                    labels: nerSiteChart.labels,
                    datasets: [{ data: nerSiteChart.values, backgroundColor: palette(nerSiteChart.labels.length) }],
                  }}
                  options={barOptsH(ch.axisCount, nerSiteChart.labels)}
                />
              </ChartPanel>
            </Card>
          ) : null}

          {tokenClusters.length > 0 ? (
            <Card padding="tight" shadow>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-foreground">{vtca.parentTopicsToken}</h3>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-muted">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell hint={metricHelpHint('views.textContentAnalysis.thCluster')}>{vtca.thRepresentative}</TableHeadCell>
                      <TableHeadCell>{vtca.thClusterScore}</TableHeadCell>
                      <TableHeadCell>{vtca.thKeywords}</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tokenClusters.map((cl: TopicCluster, idx: number) => (
                      <TableRow key={`tok-${cl.top_keyword}-${idx}`}>
                        <TableCell className="font-medium text-foreground">
                          {String(cl.top_keyword ?? cl.representative ?? '')}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {String(cl.cluster_score ?? sj.emDash)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {Array.isArray(cl.keywords) ? cl.keywords.join(', ') : sj.emDash}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : null}

          {semanticClusters.length > 0 ? (
            <Card padding="tight" shadow>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-foreground">{vtca.parentTopicsSemantic}</h3>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-muted">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell hint={metricHelpHint('views.textContentAnalysis.thCluster')}>{vtca.thRepresentative}</TableHeadCell>
                      <TableHeadCell>{vtca.thClusterScore}</TableHeadCell>
                      <TableHeadCell>{vtca.thKeywords}</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {semanticClusters.map((cl: TopicCluster, idx: number) => (
                      <TableRow key={`sem-${cl.top_keyword}-${idx}`}>
                        <TableCell className="font-medium text-foreground">
                          {String(cl.top_keyword ?? cl.representative ?? '')}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {String(cl.cluster_score ?? sj.emDash)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {Array.isArray(cl.keywords) ? cl.keywords.join(', ') : sj.emDash}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : null}

          {!languageMlChart && !nerSiteChart && tokenClusters.length === 0 && semanticClusters.length === 0 ? (
            <p className="text-sm text-muted-foreground">{sj.noData}</p>
          ) : null}
        </ViewTabPanel>
      )}
    </PageLayout>
  );
}
