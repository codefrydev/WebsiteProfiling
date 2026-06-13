import type { Chart, TooltipItem } from 'chart.js';
import { useState, useMemo } from 'react';
import { useUrlTab } from '@/hooks/useUrlTab';
import type {
  ContentAnalyticsData,
  ContentUrlsMap,
  DepthDistribution,
  OutboundLinkDomain,
  ReportSummary,
  ResponseTimeStats,
  SeoHealthStats,
  SocialCoverageStats,
  RichResultsValidationRow,
  ThinPageEntry,
  TopicCluster,
  ViewProps,
} from '@/types';
import { filterSemanticTerms, filterTopicClusters } from '@/lib/semanticTextHygiene';
import { anyChartOptions } from '../utils/chartOptions';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  BookOpen,
  Globe,
  FileText,
  AlertTriangle,
  BarChart2,
  Share2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Tag,
  Layers,
  Activity,
  ListChecks,
  Sparkles,
  Link2,
  LayoutDashboard,
  BarChart2 as BarChart2Icon,
} from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, ViewTabs, ViewTabPanel, StatCard, SectionHeader, ChartTitleWithHint } from '../components';
import { StatusDistributionChart, CoverageBar, ChartAccessibleFallback, ChartPanel } from '../components/charts';
import { crawledUrlCount } from '@/lib/crawlCounts';
import { statusDistributionFromSummary } from '../lib/statusDistribution';
import { filterZeroSlices, doughnutOptionsWithPercentTooltip, formatCompositionAria } from '../lib/chartDoughnutUtils';
import type { ViewTabItem } from '../components';
import { palette, PALETTE_CATEGORICAL } from '../utils/chartPalette';
import RichResultsValidationPanel from '../components/content/RichResultsValidationPanel';
import {
  getGridColor,
  getChartTitleColor,
  getChartCanvasTextColor,
  getChartLegendLabelColor,
  truncateChartLabel,
} from '../utils/chartJsDefaults';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

/** Shared colors for title/meta bucket comparison (missing → long). */
const COMPARE_BUCKET_COLORS = ['#EF4444', '#EAB308', '#22C55E', '#F97316'];

const barValueLabelsPlugin = {
  id: 'caBarLabels',
  afterDatasetsDraw(chart: Chart) {
    const ctx = chart.ctx;
    const isHorizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = getChartCanvasTextColor();
    ctx.textAlign = isHorizontal ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    (chart.data.datasets || []).forEach((dataset, dsi: number) => {
      const meta = chart.getDatasetMeta(dsi);
      if (!meta?.data?.length || !dataset?.data) return;
      meta.data.forEach((bar, i: number) => {
        const value = dataset.data[i];
        if (value == null || value === 0) return;
        const label = Number(value).toLocaleString();
        const x = isHorizontal ? bar.x + 6 : bar.x;
        const y = isHorizontal ? bar.y : bar.y - 12;
        ctx.fillText(label, x, y);
      });
    });
    ctx.restore();
  },
};

function barOpts(xTitle?: string) {
  const vca = strings.views.contentAnalytics;
  const pagesWord = strings.common.pages;
  return anyChartOptions({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${format(vca.chartTooltipCount, { n: ctx.raw?.toLocaleString() ?? ctx.raw })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() }, ...(xTitle ? { title: { display: true, text: xTitle } } : {}) },
      y: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: pagesWord } },
    },
  });
}

function barOptsH(yAxisLabels?: readonly string[]) {
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
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: freq } },
      y: yScale,
    },
  });
}

function groupedBarOpts(yTitle?: string) {
  const vca = strings.views.contentAnalytics;
  const def = strings.common.pages;
  return anyChartOptions({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: getChartLegendLabelColor(), font: { size: 11 }, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${format(vca.chartTooltipGrouped, { dataset: ctx.dataset.label, n: ctx.raw?.toLocaleString() })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() } },
      y: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: yTitle ?? def, color: getChartTitleColor() } },
    },
  });
}

function stackedPercentBarOpts() {
  const vca = strings.views.contentAnalytics;
  const pctAxis = strings.common.percentOfPages;
  return anyChartOptions({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: getChartLegendLabelColor(), font: { size: 11 }, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${format(vca.chartTooltipPercent, { dataset: ctx.dataset.label, pct: Number(ctx.raw).toFixed(1) })}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: getGridColor() },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: pctAxis, color: getChartTitleColor() },
      },
      y: { stacked: true, grid: { color: getGridColor() } },
    },
  });
}

function qualityBarColors(labels: string[]) {
  return labels.map((l: string) => {
    if (l.toLowerCase().includes('missing') || l.toLowerCase().includes('no h1')) return '#EF4444';
    if (l.toLowerCase().includes('short') || l.toLowerCase().includes('long')) return '#EAB308';
    if (l.toLowerCase().includes('optimal') || l.toLowerCase().includes('one h1')) return '#22C55E';
    if (l.toLowerCase().includes('multiple')) return '#DD8452';
    return '#4C72B0';
  });
}

function ThinPagesSection({ pages }: { pages: ThinPageEntry[] }) {
  const [open, setOpen] = useState(false);
  const vca = strings.views.contentAnalytics;
  const sj = strings.common;
  if (!pages || pages.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors py-1"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {format(vca.thinPagesView, { count: pages.length, s: pages.length !== 1 ? 's' : '' })}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-muted">
          <Table>
            <TableHead sticky>
              <tr>
                <TableHeadCell className="w-8 text-center">{vca.thThinHash}</TableHeadCell>
                <TableHeadCell className="min-w-[260px]">{vca.thThinUrl}</TableHeadCell>
                <TableHeadCell className="w-20 text-center">{vca.thThinWords}</TableHeadCell>
                <TableHeadCell className="w-8" />
              </tr>
            </TableHead>
            <TableBody striped>
              {pages.map((p: ThinPageEntry | string, i: number) => {
                const url = typeof p === 'string' ? p : (p.url || sj.emDash);
                const wc = typeof p === 'object' ? p.word_count : null;
                return (
                  <TableRow key={i} className="group">
                    <TableCell className="text-muted-foreground text-xs font-mono text-center w-8">{i + 1}</TableCell>
                    <TableCell className="max-w-[360px]">
                      <a
                        href={url !== sj.emDash ? url : undefined}
                        target="_blank"
                        rel="noreferrer"
                        title={url}
                        className="block font-mono text-link text-xs truncate hover:text-link-soft hover:underline transition-colors"
                      >
                        {url}
                      </a>
                    </TableCell>
                    <TableCell className="text-center w-20">
                      {wc != null && (
                        <span className="font-mono text-amber-700 dark:text-amber-400 text-xs font-bold tabular-nums">{wc}</span>
                      )}
                    </TableCell>
                    <TableCell className="w-8">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const EMPTY_SUMMARY: ReportSummary = {};
const EMPTY_RT: ResponseTimeStats = {};
const EMPTY_CA: ContentAnalyticsData = {};
const EMPTY_SC: SocialCoverageStats = {};
const EMPTY_SEO: SeoHealthStats = {};
const EMPTY_DEPTH: DepthDistribution = {};
const EMPTY_CONTENT_URLS: ContentUrlsMap = {};

const CONTENT_ANALYTICS_TABS = ['summary', 'analytics'] as const;
type ContentAnalyticsTabId = (typeof CONTENT_ANALYTICS_TABS)[number];

export default function ContentAnalytics({ searchQuery = '' }: ViewProps) {
  const vca = strings.views.contentAnalytics;
  const sj = strings.common;
  const ch = strings.charts;
  const { data } = useReport();
  const [activeTab, setActiveTab] = useUrlTab(CONTENT_ANALYTICS_TABS, 'summary');
  const q = (searchQuery || '').toLowerCase().trim();

  const thinPages = useMemo((): ThinPageEntry[] => {
    const tp = data?.content_analytics?.thin_pages;
    return Array.isArray(tp) ? tp : [];
  }, [data?.content_analytics?.thin_pages]);

  const thinPagesFiltered = useMemo(() => {
    if (!q) return thinPages;
    return thinPages.filter((p) => {
      const url = typeof p === 'string' ? p : (p.url || '');
      return String(url).toLowerCase().includes(q);
    });
  }, [thinPages, q]);

  const missingOgFiltered = useMemo(() => {
    const arr = data?.social_coverage?.missing_og || [];
    if (!q) return arr;
    return arr.filter((u) => String(u).toLowerCase().includes(q));
  }, [data?.social_coverage?.missing_og, q]);

  const missingTwitterFiltered = useMemo(() => {
    const arr = data?.social_coverage?.missing_twitter || [];
    if (!q) return arr;
    return arr.filter((u) => String(u).toLowerCase().includes(q));
  }, [data?.social_coverage?.missing_twitter, q]);

  const richResultsRows = useMemo((): RichResultsValidationRow[] => {
    const raw = data?.rich_results_validation;
    return Array.isArray(raw) ? raw : [];
  }, [data?.rich_results_validation]);

  const languageMlChart = useMemo(() => {
    const c = data?.language_summary?.counts || {};
    const entries = Object.entries(c)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 15);
    if (entries.length === 0) return null;
    return {
      labels: entries.map((x) => x[0]),
      values: entries.map((x) => Number(x[1])),
    };
  }, [data?.language_summary?.counts]);

  const nerSiteChart = useMemo(() => {
    const lc = data?.ner_site_summary?.label_counts;
    if (!lc || typeof lc !== 'object') return null;
    const entries = Object.entries(lc)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 15);
    if (entries.length === 0) return null;
    return {
      labels: entries.map((x) => x[0]),
      values: entries.map((x) => Number(x[1])),
    };
  }, [data?.ner_site_summary?.label_counts]);

  const tabItems = useMemo((): ViewTabItem[] => [
    {
      id: 'summary',
      label: vca.tabs.summary,
      icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden />,
    },
    {
      id: 'analytics',
      label: vca.tabs.analytics,
      icon: <BarChart2Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />,
    },
  ], [vca.tabs]);

  const topKw = useMemo(
    () => filterSemanticTerms(data?.content_analytics?.top_keywords_site || []),
    [data?.content_analytics?.top_keywords_site],
  );

  const tokenClusters = useMemo(
    () => filterTopicClusters(data?.keyword_opportunities?.token_topic_clusters ?? []),
    [data?.keyword_opportunities?.token_topic_clusters],
  );

  const semanticClusters = useMemo(
    () => filterTopicClusters(data?.semantic_keyword_clusters ?? []),
    [data?.semantic_keyword_clusters],
  );

  if (!data) return null;

  const summary: ReportSummary = data.summary ?? EMPTY_SUMMARY;
  const crawledCount = crawledUrlCount(data);
  const rtStats: ResponseTimeStats = data.response_time_stats ?? EMPTY_RT;
  const rtDist = rtStats.distribution || {};
  const contentUrls: ContentUrlsMap = data.content_urls ?? EMPTY_CONTENT_URLS;

  const ca: ContentAnalyticsData = data.content_analytics ?? EMPTY_CA;
  const sc: SocialCoverageStats = data.social_coverage ?? EMPTY_SC;
  const seoHealth: SeoHealthStats = data.seo_health ?? EMPTY_SEO;
  const depthDist: DepthDistribution = data.depth_distribution ?? EMPTY_DEPTH;
  const wcStats = ca.word_count_stats || {};
  const wcDist = ca.word_count_distribution || {};
  const rlDist = ca.reading_level_distribution || {};
  const crDist = ca.content_ratio_distribution || {};

  const wcLabels = Object.keys(wcDist);
  const wcValues = Object.values(wcDist).map(Number);
  const rlLabels = Object.keys(rlDist);
  const rlValues = Object.values(rlDist).map(Number);
  const crLabels = Object.keys(crDist);
  const crValues = Object.values(crDist).map(Number);
  const kwLabels = topKw.map((k) => k.word);
  const kwValues = topKw.map((k) => k.count);

  const hasThinPages = thinPages.length > 0;

  // --- H1 distribution ---
  const h1Labels = [...vca.h1Labels];
  const h1Values = [seoHealth.h1_zero || 0, seoHealth.h1_one || 0, seoHealth.h1_multi || 0];
  const hasH1Data = h1Values.some((v) => v > 0);

  // --- Title length quality ---
  const titleQualLabels = [...vca.titleQualLabels];
  const titleQualValues = [
    seoHealth.missing_title || 0,
    seoHealth.title_short || 0,
    seoHealth.title_ok || 0,
    seoHealth.title_long || 0,
  ];
  const hasTitleData = titleQualValues.some((v) => v > 0);

  // --- Meta description quality ---
  const metaQualLabels = [...vca.metaQualLabels];
  const metaQualValues = [
    seoHealth.missing_meta_desc || 0,
    seoHealth.meta_desc_short || 0,
    seoHealth.meta_desc_ok || 0,
    seoHealth.meta_desc_long || 0,
  ];
  const hasMetaData = metaQualValues.some((v) => v > 0);

  // --- Social meta comparison (grouped bar — percentages) ---
  const ogPct = sc.og_coverage_pct ?? 0;
  const twPct = sc.twitter_coverage_pct ?? 0;
  const ogImgPct = sc.og_image_coverage_pct ?? 0;
  const hasSocialData = ogPct > 0 || twPct > 0 || ogImgPct > 0;

  const hasOgImgData = sc.og_image_coverage_pct != null;

  // --- Crawl depth distribution ---
  const depthByDepth = depthDist.by_depth || {};
  const depthLabels = Object.keys(depthByDepth).map((d) => `Depth ${d}`);
  const depthValues = Object.values(depthByDepth).map(Number);
  const hasDepthData = depthLabels.length > 0;

  const statusDistribution = statusDistributionFromSummary(summary);
  const hasStatusChart = statusDistribution != null && crawledCount > 0;
  const h1Chart = filterZeroSlices(h1Labels, h1Values);
  const h1Aria = formatCompositionAria(h1Chart.labels, h1Chart.values, 'pages');

  const rtLabels = Object.keys(rtDist);
  const rtValues = rtLabels.map((k) => Number(rtDist[k]) || 0);
  const hasRtDist = rtLabels.length > 0 && rtValues.some((v) => v > 0);

  const issueKeys = vca.contentIssueKeys;
  const issueBarLabels = issueKeys.map((r) => r.label);
  const issueBarValues = issueKeys.map((r) => (contentUrls[r.key] || []).length);
  const hasIssueBar = issueBarValues.some((v) => v > 0);

  const titleTotal =
    (seoHealth.missing_title || 0) +
    (seoHealth.title_short || 0) +
    (seoHealth.title_ok || 0) +
    (seoHealth.title_long || 0);
  const metaTotal =
    (seoHealth.missing_meta_desc || 0) +
    (seoHealth.meta_desc_short || 0) +
    (seoHealth.meta_desc_ok || 0) +
    (seoHealth.meta_desc_long || 0);
  const h1Total = (seoHealth.h1_zero || 0) + (seoHealth.h1_one || 0) + (seoHealth.h1_multi || 0);
  const titleOkPct = titleTotal > 0 ? (100 * (seoHealth.title_ok || 0)) / titleTotal : 0;
  const metaOkPct = metaTotal > 0 ? (100 * (seoHealth.meta_desc_ok || 0)) / metaTotal : 0;
  const h1OkPct = h1Total > 0 ? (100 * (seoHealth.h1_one || 0)) / h1Total : 0;
  const hasSeoOptimalBar = titleTotal > 0 && metaTotal > 0 && h1Total > 0;

  const thinByWords = thinPages.length;
  const thinByChars = Number(seoHealth.thin_content) || 0;
  const hasThinCompare = thinByWords > 0 || thinByChars > 0;

  const titleBucketCounts = [
    seoHealth.missing_title || 0,
    seoHealth.title_short || 0,
    seoHealth.title_ok || 0,
    seoHealth.title_long || 0,
  ];
  const metaBucketCounts = [
    seoHealth.missing_meta_desc || 0,
    seoHealth.meta_desc_short || 0,
    seoHealth.meta_desc_ok || 0,
    seoHealth.meta_desc_long || 0,
  ];
  const hasTitleMetaCompare =
    hasTitleData &&
    hasMetaData &&
    (titleBucketCounts.some((v) => v > 0) || metaBucketCounts.some((v) => v > 0));

  const titleGapCount = titleTotal - (seoHealth.title_ok || 0);
  const metaGapCount = metaTotal - (seoHealth.meta_desc_ok || 0);
  const h1GapCount = h1Total - (seoHealth.h1_one || 0);
  const hasSeoGapCountCompare = hasSeoOptimalBar;

  const ogMissCount = (sc.missing_og || []).length;
  const twMissCount = (sc.missing_twitter || []).length;
  const hasSocialMissCompare = ogMissCount > 0 || twMissCount > 0;

  const wcPercLabels = vca.wcPercLabels;
  const wcPercRaw = [wcStats.min, wcStats.p25, wcStats.median, wcStats.mean, wcStats.p75, wcStats.max];
  const wcPercValues = wcPercRaw.map((v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null));
  const hasWcPercBar = wcPercValues.every((v) => v != null) && (wcStats.max ?? 0) > 0;

  const hreflang = data.hreflang_summary;
  const outboundDomains = data.outbound_link_domains ?? [];

  return (
    <PageLayout className="space-y-6">
      <PageHeader title={vca.title} subtitle={vca.subtitle} />

      <ViewTabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ContentAnalyticsTabId)}
        ariaLabel={vca.title}
        idPrefix="content-analytics"
      />

      {activeTab === 'summary' && (
        <ViewTabPanel idPrefix="content-analytics" tabId="summary" className="space-y-6">
      {/* KPI stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label={vca.meanWords}
          value={wcStats.mean != null ? Math.round(wcStats.mean).toLocaleString() : sj.emDash}
          sub={vca.perPage}
          icon={<BookOpen className="h-4 w-4" aria-hidden />}
          hint={metricHelpHint('shared.avgWords')}
          shadow
        />
        <StatCard
          label={vca.medianWords}
          value={wcStats.median != null ? Math.round(wcStats.median).toLocaleString() : sj.emDash}
          sub={vca.perPage}
          icon={<FileText className="h-4 w-4" aria-hidden />}
          hint={metricHelpHint('shared.medianWords')}
          shadow
        />
        <StatCard
          label={vca.ogCoverage}
          value={sc.og_coverage_pct != null ? `${sc.og_coverage_pct}%` : sj.emDash}
          sub={vca.ogTags}
          icon={<Globe className="h-4 w-4 text-link" aria-hidden />}
          hint={metricHelpHint('views.overview.ogCoverage')}
          shadow
          className="[&_.text-2xl]:text-link"
        />
        <StatCard
          label={vca.twitterCoverage}
          value={sc.twitter_coverage_pct != null ? `${sc.twitter_coverage_pct}%` : sj.emDash}
          sub={vca.twitterTags}
          icon={<Share2 className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden />}
          hint={metricHelpHint('views.contentAnalytics.twitterCoverage')}
          shadow
          className="[&_.text-2xl]:text-sky-700 [&_.text-2xl]:dark:text-sky-400"
        />
        <StatCard
          label={vca.thinPages}
          value={thinPages.length}
          sub={vca.under300}
          icon={<AlertTriangle className={`h-4 w-4 ${hasThinPages ? 'text-amber-700 dark:text-amber-400' : ''}`} aria-hidden />}
          hint={metricHelpHint('shared.thinPages')}
          shadow
          className={hasThinPages ? 'ring-1 ring-amber-500/20 border-amber-900/30 [&_.text-2xl]:text-amber-700 [&_.text-2xl]:dark:text-amber-400' : ''}
        />
      </div>

      {richResultsRows.length > 0 ? (
        <RichResultsValidationPanel rows={richResultsRows} meta={data?.rich_results_meta} />
      ) : null}

      {((hreflang?.pages_200 ?? 0) > 0 || outboundDomains.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(hreflang?.pages_200 ?? 0) > 0 && (
            <Card padding="tight" shadow>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-sky-700 dark:text-sky-400" />
                <h3 className="text-sm font-bold text-foreground">{vca.i18nTitle}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-brand-900 border border-default rounded-lg p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">{vca.pages2xx}</div>
                  <div className="text-xl font-bold text-foreground">{hreflang?.pages_200}</div>
                </div>
                <div className="bg-brand-900 border border-default rounded-lg p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">{vca.missingHtmlLang}</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{hreflang?.pages_missing_html_lang ?? sj.emDash}</div>
                </div>
                <div className="bg-brand-900 border border-default rounded-lg p-3 col-span-2">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">{vca.pagesHreflang}</div>
                  <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{hreflang?.pages_with_hreflang_links ?? sj.emDash}</div>
                </div>
              </div>
            </Card>
          )}
          {outboundDomains.length > 0 && (
            <Card padding="tight" shadow className={(hreflang?.pages_200 ?? 0) > 0 ? '' : 'lg:col-span-2'}>
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-orange-700 dark:text-orange-400" />
                <h3 className="text-sm font-bold text-foreground">{vca.outboundDomains}</h3>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-muted">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>{vca.thHost}</TableHeadCell>
                      <TableHeadCell className="text-right">{vca.thLinks}</TableHeadCell>
                      <TableHeadCell className="text-right">{vca.thPages}</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {outboundDomains.map((row: OutboundLinkDomain) => (
                      <TableRow key={row.host}>
                        <TableCell className="font-mono text-xs text-foreground">{row.host}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{row.link_count ?? sj.emDash}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{row.page_count ?? sj.emDash}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      )}

      {languageMlChart && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-400" />
            <h3 className="text-sm font-bold text-foreground">{vca.languageMix}</h3>
          </div>
          <ChartPanel>
            <Bar
              data={{
                labels: languageMlChart.labels,
                datasets: [
                  {
                    label: vca.thPages,
                    data: languageMlChart.values,
                    backgroundColor: palette(languageMlChart.labels.length),
                  },
                ],
              }}
              options={barOpts(vca.thPages)}
            />
          </ChartPanel>
        </Card>
      )}

      {nerSiteChart && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-cyan-700 dark:text-cyan-400" />
            <h3 className="text-sm font-bold text-foreground">{vca.entityLabels}</h3>
          </div>
          <ChartPanel>
            <Bar
              data={{
                labels: nerSiteChart.labels,
                datasets: [
                  {
                    label: vca.countAxis,
                    data: nerSiteChart.values,
                    backgroundColor: palette(nerSiteChart.labels.length),
                  },
                ],
              }}
              options={barOptsH(nerSiteChart.labels)}
            />
          </ChartPanel>
        </Card>
      )}

      {tokenClusters.length > 0 && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <h3 className="text-sm font-bold text-foreground">{vca.parentTopicsToken}</h3>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-muted">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>{vca.thRepresentative}</TableHeadCell>
                  <TableHeadCell>{vca.thClusterScore}</TableHeadCell>
                  <TableHeadCell>{vca.thKeywords}</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokenClusters.map((cl: TopicCluster, idx: number) => (
                  <TableRow key={`tok-${cl.top_keyword}-${idx}`}>
                    <TableCell className="font-medium text-foreground">{String(cl.top_keyword ?? cl.representative ?? '')}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{String(cl.cluster_score ?? sj.emDash)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Array.isArray(cl.keywords) ? cl.keywords.join(', ') : sj.emDash}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {semanticClusters.length > 0 && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-foreground">{vca.parentTopicsSemantic}</h3>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-muted">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>{vca.thRepresentative}</TableHeadCell>
                  <TableHeadCell>{vca.thClusterScore}</TableHeadCell>
                  <TableHeadCell>{vca.thKeywords}</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {semanticClusters.map((cl: TopicCluster, idx: number) => (
                  <TableRow key={`${cl.top_keyword}-${idx}`}>
                    <TableCell className="font-medium text-foreground">{String(cl.top_keyword ?? cl.representative ?? '')}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{String(cl.cluster_score ?? sj.emDash)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Array.isArray(cl.keywords) ? cl.keywords.join(', ') : sj.emDash}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

        </ViewTabPanel>
      )}

      {activeTab === 'analytics' && (
        <ViewTabPanel idPrefix="content-analytics" tabId="analytics" className="space-y-6">
      {(hasStatusChart || hasRtDist) && (
        <div className="space-y-6">
          <SectionHeader icon={Activity} title={vca.crawlHealth} hint={metricHelpHint('views.contentAnalytics.crawlHealth')} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hasStatusChart && (
              <Card padding="tight">
                <ChartTitleWithHint title={vca.urlsByStatus} helpKey="views.contentAnalytics.urlsByStatus" className="mb-1" />
                <p className="text-xs text-muted-foreground mb-3">
                  {vca.totalCrawled}{' '}
                  <span className="text-foreground font-semibold">{crawledCount.toLocaleString()}</span>
                  {summary.success_rate != null && (
                    <> · <span className="text-green-700 dark:text-green-400 font-semibold">{summary.success_rate}%</span> {vca.returned2xx}
                    </>
                  )}
                </p>
                <ChartPanel heightClass="h-64">
                  <StatusDistributionChart distribution={statusDistribution!} heightClass="h-64" />
                </ChartPanel>
              </Card>
            )}
            {hasRtDist && (
              <Card padding="tight">
                <ChartTitleWithHint title={vca.responseTimeDist} helpKey="views.contentAnalytics.responseTimeDist" className="mb-1" />
                <p className="text-xs text-muted-foreground mb-3">
                  Pages per latency band
                  {rtStats.p50 != null && (
                    <>
                      {' '}
                      · p50: <span className="text-foreground font-mono">{Math.round(rtStats.p50)}ms</span>
                      {rtStats.p95 != null && (
                        <>
                          , p95: <span className="text-foreground font-mono">{Math.round(rtStats.p95)}ms</span>
                        </>
                      )}
                    </>
                  )}
                </p>
                <ChartPanel heightClass="h-64">
                  <Bar
                    data={{
                      labels: rtLabels,
                      datasets: [{ data: rtValues, backgroundColor: palette(rtLabels.length) }],
                    }}
                    options={{
                      ...barOpts(ch.timeBucket),
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw?.toLocaleString()} URLs` } },
                      },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                </ChartPanel>
              </Card>
            )}
          </div>
        </div>
      )}

      {(hasIssueBar || hasSeoOptimalBar || hasThinCompare) && (
        <div className="space-y-6">
          <SectionHeader icon={ListChecks} title={vca.onPageQuality} hint={metricHelpHint('views.contentAnalytics.onPageQuality')} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hasIssueBar && (
              <Card padding="tight">
                <ChartTitleWithHint title="URLs flagged by issue type" helpKey="views.contentAnalytics.issuesByType" />
                <ChartPanel heightClass="h-80">
                  <Bar
                    data={{
                      labels: issueBarLabels,
                      datasets: [{ data: issueBarValues, backgroundColor: palette(issueBarLabels.length) }],
                    }}
                    options={{
                      ...barOptsH(issueBarLabels),
                      plugins: {
                        ...barOptsH(issueBarLabels).plugins,
                        tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw?.toLocaleString()} URLs` } },
                      },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                </ChartPanel>
              </Card>
            )}
            {hasSeoOptimalBar && (
              <Card padding="tight">
                <ChartTitleWithHint title='Pages in “good” ranges' helpKey="views.contentAnalytics.seoOptimalRanges" />
                <ChartPanel>
                  <Bar
                    data={{
                      labels: ['Title length', 'Meta description', 'H1 count'],
                      datasets: [
                        {
                          label: 'In range / optimal',
                          data: [titleOkPct, metaOkPct, h1OkPct],
                          backgroundColor: '#22C55E',
                        },
                        {
                          label: 'Needs attention',
                          data: [100 - titleOkPct, 100 - metaOkPct, 100 - h1OkPct],
                          backgroundColor: '#EF444466',
                        },
                      ],
                    }}
                    options={stackedPercentBarOpts()}
                  />
                </ChartPanel>
              </Card>
            )}
            {hasThinCompare && (
              <Card padding="tight" className={hasIssueBar && hasSeoOptimalBar ? 'lg:col-span-2' : ''}>
                <ChartTitleWithHint title={vca.thinSignals} helpKey="views.contentAnalytics.thinSignals" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                  <StatCard
                    label={vca.thinUnder300}
                    value={thinByWords.toLocaleString()}
                    sub={sj.pages}
                    hint={metricHelpHint('shared.thinPages')}
                  />
                  <StatCard
                    label={vca.thinSmallBody}
                    value={thinByChars.toLocaleString()}
                    sub={sj.pages}
                    hint={metricHelpHint('views.contentAnalytics.thinSmallBody')}
                  />
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Thin pages expandable list */}
      {hasThinPages && (
        <Card padding="default">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {q
                ? `${thinPagesFiltered.length} of ${thinPages.length} thin page${thinPages.length !== 1 ? 's' : ''} match search`
                : `${thinPages.length} page${thinPages.length !== 1 ? 's' : ''} have very little content`}
            </span>
          </div>
          {thinPagesFiltered.length > 0 ? (
            <ThinPagesSection pages={thinPagesFiltered} />
          ) : (
            <p className="text-sm text-muted-foreground">{vca.noThinSearch}</p>
          )}
        </Card>
      )}

      {/* Content Metrics section */}
      <div className="space-y-6">
        <SectionHeader icon={BarChart2} title={vca.contentMetrics} hint={metricHelpHint('views.contentAnalytics.contentMetrics')} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="tight">
            <ChartTitleWithHint title={vca.wordCountDist} helpKey="views.contentAnalytics.wordCountDist" />
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
            <ChartTitleWithHint title={vca.readingLevelDist} helpKey="views.contentAnalytics.readingLevelDist" />
            <ChartPanel heightClass="h-64">
              {rlLabels.length > 0 ? (
                <Bar
                  data={{
                    labels: rlLabels,
                    datasets: [{ data: rlValues, backgroundColor: ['#22C55E', '#4C72B0', '#EAB308', '#EF4444'].slice(0, rlLabels.length) }],
                  }}
                  options={{ ...barOptsH(rlLabels), plugins: { ...barOptsH(rlLabels).plugins, tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw} pages` } } } }}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
              )}
            </ChartPanel>
          </Card>

          <Card padding="tight">
            <ChartTitleWithHint title={vca.contentHtmlRatio} helpKey="views.contentAnalytics.contentHtmlRatio" />
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

          <Card padding="tight">
            <ChartTitleWithHint title={vca.topKeywords} helpKey="views.contentAnalytics.topKeywords" />
            <ChartPanel heightClass="h-[28rem]">
              {kwLabels.length > 0 ? (
                <Bar
                  data={{ labels: kwLabels, datasets: [{ data: kwValues, backgroundColor: PALETTE_CATEGORICAL[0] }] }}
                  options={barOptsH(kwLabels)}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{vca.noKeywordData}</div>
              )}
            </ChartPanel>
          </Card>

          {hasWcPercBar && (
            <Card padding="tight" className="lg:col-span-2">
              <ChartTitleWithHint title={vca.wordCountLadder} helpKey="views.contentAnalytics.wordCountLadder" />
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
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx: TooltipItem<'bar'>) => ` ${Number(ctx.raw).toLocaleString()} words`,
                        },
                      },
                    },
                    scales: {
                      x: { grid: { color: getGridColor() }, title: { display: true, text: 'Statistic', color: getChartTitleColor() } },
                      y: {
                        grid: { color: getGridColor() },
                        beginAtZero: true,
                        title: { display: true, text: 'Words', color: getChartTitleColor() },
                      },
                    },
                  }}
                  plugins={[barValueLabelsPlugin]}
                />
              </ChartPanel>
            </Card>
          )}
        </div>
      </div>

      {/* On-Page SEO Signals section */}
      {(hasH1Data || hasTitleData || hasMetaData) && (
        <div className="space-y-6">
          <SectionHeader icon={Tag} title={vca.onPageSignals} hint={metricHelpHint('views.contentAnalytics.onPageSignals')} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* H1 Distribution Doughnut */}
            <Card padding="tight">
              <ChartTitleWithHint title={vca.h1Dist} helpKey="views.contentAnalytics.h1Dist" />
              <ChartPanel>
                {hasH1Data ? (
                  <ChartAccessibleFallback
                    summary={h1Aria}
                    rows={h1Chart.labels.map((label, i) => [label, h1Chart.values[i] ?? 0] as [string, string | number])}
                  >
                    <div className="h-full flex items-center justify-center min-w-0 overflow-hidden" role="presentation">
                      <div className="w-full max-w-[240px] h-full">
                        <Doughnut
                          data={{
                            labels: h1Chart.labels,
                            datasets: [{
                              data: h1Chart.values,
                              backgroundColor: ['#EF4444', '#22C55E', '#DD8452'].slice(0, h1Chart.labels.length),
                              borderColor: 'rgba(15,23,42,0.8)',
                              borderWidth: 2,
                            }],
                          }}
                          options={doughnutOptionsWithPercentTooltip()}
                        />
                      </div>
                    </div>
                  </ChartAccessibleFallback>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
                )}
              </ChartPanel>
            </Card>

            {/* Title Length Quality */}
            <Card padding="tight">
              <ChartTitleWithHint title={vca.titleTagQuality} helpKey="views.contentAnalytics.titleTagQuality" />
              <ChartPanel>
                {hasTitleData ? (
                  <Bar
                    data={{
                      labels: titleQualLabels,
                      datasets: [{ data: titleQualValues, backgroundColor: qualityBarColors(titleQualLabels) }],
                    }}
                    options={{
                      ...barOpts(),
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw?.toLocaleString()} pages` } } },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
                )}
              </ChartPanel>
            </Card>

            {/* Meta Description Quality */}
            <Card padding="tight">
              <ChartTitleWithHint title={vca.metaDescQuality} helpKey="views.contentAnalytics.metaDescQuality" />
              <ChartPanel>
                {hasMetaData ? (
                  <Bar
                    data={{
                      labels: metaQualLabels,
                      datasets: [{ data: metaQualValues, backgroundColor: qualityBarColors(metaQualLabels) }],
                    }}
                    options={{
                      ...barOpts(),
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw?.toLocaleString()} pages` } } },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
                )}
              </ChartPanel>
            </Card>
          </div>

          {(hasTitleMetaCompare || hasSeoGapCountCompare) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
              {hasTitleMetaCompare && (
                <Card padding="tight">
                  <ChartTitleWithHint title={vca.titleVsMetaBuckets} helpKey="views.contentAnalytics.titleVsMetaBuckets" />
                  <ChartPanel heightClass="h-64">
                    <Bar
                      data={{
                        labels: vca.compareBuckets,
                        datasets: [
                          {
                            label: vca.datasetTitleTags,
                            data: titleBucketCounts,
                            backgroundColor: COMPARE_BUCKET_COLORS,
                          },
                          {
                            label: vca.datasetMetaTags,
                            data: metaBucketCounts,
                            backgroundColor: COMPARE_BUCKET_COLORS,
                          },
                        ],
                      }}
                      options={groupedBarOpts(sj.pages)}
                      plugins={[barValueLabelsPlugin]}
                    />
                  </ChartPanel>
                </Card>
              )}
              {hasSeoGapCountCompare && (
                <Card padding="tight">
                  <ChartTitleWithHint title={vca.seoOptimalVsGapCounts} helpKey="views.contentAnalytics.seoOptimalVsGapCounts" />
                  <ChartPanel heightClass="h-64">
                    <Bar
                      data={{
                        labels: [vca.seoTitle, vca.seoMeta, vca.seoH1],
                        datasets: [
                          {
                            label: vca.stackedInRange,
                            data: [seoHealth.title_ok || 0, seoHealth.meta_desc_ok || 0, seoHealth.h1_one || 0],
                            backgroundColor: '#22C55E',
                          },
                          {
                            label: vca.stackedNeeds,
                            data: [titleGapCount, metaGapCount, h1GapCount],
                            backgroundColor: 'rgba(239, 68, 68, 0.45)',
                          },
                        ],
                      }}
                      options={groupedBarOpts(sj.pages)}
                      plugins={[barValueLabelsPlugin]}
                    />
                  </ChartPanel>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* Social Meta Coverage section */}
      <div className="space-y-6">
        <SectionHeader icon={Share2} title={vca.socialMetaCoverage} hint={metricHelpHint('views.contentAnalytics.socialMetaCoverage')} />

        {/* Coverage progress bars */}
        {(sc.og_coverage_pct != null || sc.twitter_coverage_pct != null || hasOgImgData) && (
          <Card shadow>
            <div className="space-y-4">
              {sc.og_coverage_pct != null && (
                <CoverageBar label={vca.ogProgress} pct={sc.og_coverage_pct} color="text-link" />
              )}
              {sc.twitter_coverage_pct != null && (
                <CoverageBar label={vca.twitterProgress} pct={sc.twitter_coverage_pct} color="text-sky-700 dark:text-sky-400" />
              )}
              {hasOgImgData && (
                <CoverageBar label={vca.ogImage} pct={sc.og_image_coverage_pct} color="text-violet-700 dark:text-violet-400" />
              )}
            </div>
          </Card>
        )}

        {/* Social meta visual comparison */}
        {hasSocialData && (
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-3">{vca.socialOverview}</h3>
            <ChartPanel heightClass="h-64">
              <Bar
                data={{
                  labels: [vca.openGraph, vca.twitterCard, vca.ogImage],
                  datasets: [
                    {
                      label: vca.datasetHasTag,
                      data: [ogPct, twPct, ogImgPct],
                      backgroundColor: '#22C55E',
                    },
                    {
                      label: vca.datasetMissing,
                      data: [100 - ogPct, 100 - twPct, 100 - ogImgPct],
                      backgroundColor: '#EF444466',
                    },
                  ],
                }}
                options={{
                  ...groupedBarOpts(),
                  scales: {
                    x: { stacked: true, grid: { color: getGridColor() } },
                    y: { stacked: true, grid: { color: getGridColor() }, beginAtZero: true, max: 100, title: { display: true, text: 'Coverage %', color: getChartTitleColor() } },
                  },
                  plugins: {
                    legend: { display: true, labels: { color: getChartLegendLabelColor(), font: { size: 11 }, padding: 10 } },
                    tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(1)}%` } },
                  },
                }}
              />
            </ChartPanel>
          </Card>
        )}

        {hasSocialMissCompare && (
          <Card padding="tight" shadow>
            <ChartTitleWithHint title={vca.missingSocialUrlCompare} helpKey="views.contentAnalytics.missingSocialCompare" />
            <ChartPanel className="max-w-lg">
              <Bar
                data={{
                  labels: [vca.openGraph, vca.twitterCard],
                  datasets: [
                    {
                      label: vca.datasetMissing,
                      data: [ogMissCount, twMissCount],
                      backgroundColor: ['#3B82F6', '#38BDF8'],
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw?.toLocaleString()} ${sj.urls}`,
                      },
                    },
                  },
                  scales: {
                    x: { grid: { color: getGridColor() } },
                    y: {
                      grid: { color: getGridColor() },
                      beginAtZero: true,
                      title: { display: true, text: sj.urls, color: getChartTitleColor() },
                    },
                  },
                }}
                plugins={[barValueLabelsPlugin]}
              />
            </ChartPanel>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(sc.missing_og || []).length > 0 && (
            <Card overflowHidden padding="none">
              <div className="px-4 py-3 border-b border-muted flex items-center gap-2">
                <Globe className="h-4 w-4 text-link" />
                <h3 className="text-sm font-bold text-foreground">Missing Open Graph Tags</h3>
                <span className="ml-auto text-xs font-bold text-muted-foreground bg-brand-700/60 rounded-full px-2.5 py-0.5">
                  {missingOgFiltered.length}
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {missingOgFiltered.length > 0 ? (
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell className="w-8 text-center">#</TableHeadCell>
                      <TableHeadCell>URL</TableHeadCell>
                      <TableHeadCell className="w-8" />
                    </tr>
                  </TableHead>
                  <TableBody striped>
                    {missingOgFiltered.slice(0, 50).map((u, i) => (
                      <TableRow key={i} className="group">
                        <TableCell className="text-muted-foreground text-xs font-mono text-center w-8">{i + 1}</TableCell>
                        <TableCell className="max-w-[360px]">
                          <a
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            title={u}
                            className="block font-mono text-link text-xs truncate hover:text-link-soft hover:underline transition-colors"
                          >
                            {u}
                          </a>
                        </TableCell>
                        <TableCell className="w-8">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">{vca.noUrlSearch}</p>
                )}
              </div>
            </Card>
          )}

          {(sc.missing_twitter || []).length > 0 && (
            <Card overflowHidden padding="none">
              <div className="px-4 py-3 border-b border-muted flex items-center gap-2">
                <Share2 className="h-4 w-4 text-sky-700 dark:text-sky-400" />
                <h3 className="text-sm font-bold text-foreground">Missing Twitter Card Tags</h3>
                <span className="ml-auto text-xs font-bold text-muted-foreground bg-brand-700/60 rounded-full px-2.5 py-0.5">
                  {missingTwitterFiltered.length}
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {missingTwitterFiltered.length > 0 ? (
                <Table>
                  <TableHead sticky>
                    <tr>
                      <TableHeadCell className="w-8 text-center">#</TableHeadCell>
                      <TableHeadCell>URL</TableHeadCell>
                      <TableHeadCell className="w-8" />
                    </tr>
                  </TableHead>
                  <TableBody striped>
                    {missingTwitterFiltered.slice(0, 50).map((u, i) => (
                      <TableRow key={i} className="group">
                        <TableCell className="text-muted-foreground text-xs font-mono text-center w-8">{i + 1}</TableCell>
                        <TableCell className="max-w-[360px]">
                          <a
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            title={u}
                            className="block font-mono text-link text-xs truncate hover:text-link-soft hover:underline transition-colors"
                          >
                            {u}
                          </a>
                        </TableCell>
                        <TableCell className="w-8">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">{vca.noUrlSearch}</p>
                )}
              </div>
            </Card>
          )}

          {(sc.missing_og || []).length === 0 && (sc.missing_twitter || []).length === 0 && (
            <Card className="col-span-2 flex items-center gap-3 py-6">
              <Share2 className="h-8 w-8 text-green-500" />
              <p className="text-muted-foreground text-sm">{strings.views.contentAnalytics.socialAllGood}</p>
            </Card>
          )}
        </div>
      </div>
      {/* Site Architecture section */}
      {hasDepthData && (
        <div className="space-y-6">
          <SectionHeader icon={Layers} title={vca.siteArchitecture} hint={metricHelpHint('views.contentAnalytics.siteArchitecture')} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card padding="tight">
              <ChartTitleWithHint title="Crawl Depth Distribution" helpKey="views.contentAnalytics.crawlDepthDist" />
              {(depthDist.max_depth != null || depthDist.avg_depth != null) && (
                <p className="text-xs text-muted-foreground mb-3">
                  {depthDist.max_depth != null && (
                    <>
                      Max depth: <span className="text-foreground font-semibold">{depthDist.max_depth}</span>
                    </>
                  )}
                  {depthDist.max_depth != null && depthDist.avg_depth != null && ' · '}
                  {depthDist.avg_depth != null && (
                    <>
                      avg: <span className="text-foreground font-semibold">{depthDist.avg_depth}</span>
                    </>
                  )}
                </p>
              )}
              <ChartPanel heightClass="h-64">
                <Bar
                  data={{
                    labels: depthLabels,
                    datasets: [{ data: depthValues, backgroundColor: palette(depthLabels.length) }],
                  }}
                  options={{
                    ...barOpts(ch.depth),
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw?.toLocaleString()} pages` } },
                    },
                  }}
                  plugins={[barValueLabelsPlugin]}
                />
              </ChartPanel>
            </Card>

            {/* Word count percentile summary */}
            {wcStats.median != null && (
              <Card padding="tight">
                <ChartTitleWithHint title={vca.wordCountPercentiles} helpKey="views.contentAnalytics.wordCountPercentiles" />
                <div className="space-y-3">
                  {[
                    { label: 'Min', value: wcStats.min, color: 'text-muted-foreground', barW: 0 },
                    { label: '25th Percentile (P25)', value: wcStats.p25, color: 'text-amber-700 dark:text-amber-400', barW: 25 },
                    { label: 'Median (P50)', value: wcStats.median, color: 'text-link', barW: 50 },
                    { label: 'Mean (Avg)', value: wcStats.mean, color: 'text-purple-700 dark:text-purple-400', barW: null },
                    { label: '75th Percentile (P75)', value: wcStats.p75, color: 'text-green-700 dark:text-green-400', barW: 75 },
                    { label: 'Max', value: wcStats.max, color: 'text-foreground', barW: 100 },
                  ].map(({ label, value, color, barW }) => {
                    const maxWc = wcStats.max ?? 0;
                    const pct = barW != null ? barW : maxWc > 0 ? Math.min(100, ((value ?? 0) / maxWc) * 100) : 0;
                    return (
                      <div key={label} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className={`font-bold tabular-nums ${color}`}>
                            {value != null ? Math.round(value).toLocaleString() : '—'}
                          </span>
                        </div>
                        <div className="h-1.5 bg-track rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${color.replace('text-', 'bg-')}`}
                            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
        </ViewTabPanel>
      )}
    </PageLayout>
  );
}
