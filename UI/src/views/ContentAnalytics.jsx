import { useState, useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  BookOpen,
  Globe,
  Twitter,
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
} from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import BrowserMlPanel from '../components/ml/BrowserMlPanel';
import { palette, PALETTE_CATEGORICAL } from '../utils/chartPalette';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

/** Shared colors for title/meta bucket comparison (missing → long). */
const COMPARE_BUCKET_COLORS = ['#EF4444', '#EAB308', '#22C55E', '#F97316'];

const barValueLabelsPlugin = {
  id: 'caBarLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const isHorizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgb(203, 213, 225)';
    ctx.textAlign = isHorizontal ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    (chart.data.datasets || []).forEach((dataset, dsi) => {
      const meta = chart.getDatasetMeta(dsi);
      if (!meta?.data?.length || !dataset?.data) return;
      meta.data.forEach((bar, i) => {
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

function barOpts(xTitle) {
  const vca = strings.views.contentAnalytics;
  const pagesWord = strings.common.pages;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(vca.chartTooltipCount, { n: ctx.raw?.toLocaleString() ?? ctx.raw })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: GRID_COLOR }, ...(xTitle ? { title: { display: true, text: xTitle } } : {}) },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: pagesWord } },
    },
  };
}

function barOptsH() {
  const freq = strings.charts.axisFrequency;
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw}` } } },
    scales: {
      x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: freq } },
      y: { grid: { color: GRID_COLOR } },
    },
  };
}

function doughnutOpts() {
  const vca = strings.views.contentAnalytics;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(vca.chartTooltipDoughnut, { label: ctx.label, n: ctx.raw?.toLocaleString() })}`,
        },
      },
    },
  };
}

function groupedBarOpts(yTitle) {
  const vca = strings.views.contentAnalytics;
  const def = strings.common.pages;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(vca.chartTooltipGrouped, { dataset: ctx.dataset.label, n: ctx.raw?.toLocaleString() })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: GRID_COLOR } },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: yTitle ?? def, color: '#64748b' } },
    },
  };
}

function stackedPercentBarOpts() {
  const vca = strings.views.contentAnalytics;
  const pctAxis = strings.common.percentOfPages;
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(vca.chartTooltipPercent, { dataset: ctx.dataset.label, pct: Number(ctx.raw).toFixed(1) })}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: GRID_COLOR },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: pctAxis, color: '#64748b' },
      },
      y: { stacked: true, grid: { color: GRID_COLOR } },
    },
  };
}

function qualityBarColors(labels) {
  return labels.map((l) => {
    if (l.toLowerCase().includes('missing') || l.toLowerCase().includes('no h1')) return '#EF4444';
    if (l.toLowerCase().includes('short') || l.toLowerCase().includes('long')) return '#EAB308';
    if (l.toLowerCase().includes('optimal') || l.toLowerCase().includes('one h1')) return '#22C55E';
    if (l.toLowerCase().includes('multiple')) return '#DD8452';
    return '#4C72B0';
  });
}

function SectionHeader({ icon, title, description }) {
  const Icon = icon;
  return (
    <div className="flex items-start gap-3 border-b border-muted pb-4">
      <div className="p-2 bg-brand-800 border border-default rounded-lg">
        <Icon className="h-5 w-5 text-blue-400" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-bright">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

function CoverageBar({ label, pct, color }) {
  const safeP = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span className="font-medium">{label}</span>
        <span className={`font-bold ${color}`}>{safeP}%</span>
      </div>
      <div className="h-2 bg-track rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${safeP >= 80 ? 'bg-green-500' : safeP >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${safeP}%` }}
        />
      </div>
    </div>
  );
}

function ThinPagesSection({ pages }) {
  const [open, setOpen] = useState(false);
  const vca = strings.views.contentAnalytics;
  const sj = strings.common;
  if (!pages || pages.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors py-1"
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
              {pages.map((p, i) => {
                const url = typeof p === 'string' ? p : (p.url || sj.emDash);
                const wc = typeof p === 'object' ? p.word_count : null;
                return (
                  <TableRow key={i} className="group">
                    <TableCell className="text-slate-600 text-xs font-mono text-center w-8">{i + 1}</TableCell>
                    <TableCell className="max-w-[360px]">
                      <a
                        href={url !== sj.emDash ? url : undefined}
                        target="_blank"
                        rel="noreferrer"
                        title={url}
                        className="block font-mono text-blue-400 text-xs truncate hover:text-blue-300 hover:underline transition-colors"
                      >
                        {url}
                      </a>
                    </TableCell>
                    <TableCell className="text-center w-20">
                      {wc != null && (
                        <span className="font-mono text-amber-400 text-xs font-bold tabular-nums">{wc}</span>
                      )}
                    </TableCell>
                    <TableCell className="w-8">
                      <ExternalLink className="h-3.5 w-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
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

export default function ContentAnalytics({ searchQuery = '' }) {
  const vca = strings.views.contentAnalytics;
  const sj = strings.common;
  const ch = strings.charts;
  const { data } = useReport();
  const q = (searchQuery || '').toLowerCase().trim();

  const thinPages = useMemo(() => {
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

  const languageMlChart = useMemo(() => {
    const c = data?.language_summary?.counts || {};
    const entries = Object.entries(c)
      .sort((a, b) => b[1] - a[1])
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

  if (!data) return null;

  const summary = data.summary || {};
  const rtStats = data.response_time_stats || {};
  const rtDist = rtStats.distribution || {};
  const contentUrls = data.content_urls || {};

  const ca = data.content_analytics || {};
  const sc = data.social_coverage || {};
  const seoHealth = data.seo_health || {};
  const depthDist = data.depth_distribution || {};
  const wcStats = ca.word_count_stats || {};
  const wcDist = ca.word_count_distribution || {};
  const rlDist = ca.reading_level_distribution || {};
  const crDist = ca.content_ratio_distribution || {};
  const topKw = ca.top_keywords_site || [];

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

  // --- OG image doughnut ---
  const ogImgMissingPct = Math.max(0, 100 - ogImgPct);
  const hasOgImgData = sc.og_image_coverage_pct != null;

  // --- Crawl depth distribution ---
  const depthByDepth = depthDist.by_depth || {};
  const depthLabels = Object.keys(depthByDepth).map((d) => `Depth ${d}`);
  const depthValues = Object.values(depthByDepth).map(Number);
  const hasDepthData = depthLabels.length > 0;

  const statusDoughnut = (() => {
    const parts = [
      ['2xx OK', Number(summary.count_2xx) || 0],
      ['3xx Redirect', Number(summary.count_3xx) || 0],
      ['4xx Client error', Number(summary.count_4xx) || 0],
      ['5xx Server error', Number(summary.count_5xx) || 0],
      ['Error / blocked', Number(summary.count_error) || 0],
    ].filter(([, n]) => n > 0);
    return {
      labels: parts.map((p) => p[0]),
      values: parts.map((p) => p[1]),
    };
  })();
  const hasStatusChart = statusDoughnut.values.length > 0 && (Number(summary.total_urls) || 0) > 0;

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
  const hasWcPercBar = wcPercValues.every((v) => v != null) && wcStats.max > 0;

  return (
    <PageLayout className="space-y-8">
      <PageHeader title={vca.title} subtitle={vca.subtitle} />

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {vca.meanWords}
          </div>
          <div className="text-3xl font-bold text-bright">
            {wcStats.mean != null ? Math.round(wcStats.mean).toLocaleString() : sj.emDash}
          </div>
          <div className="text-xs text-slate-500 mt-1">{vca.perPage}</div>
        </Card>

        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" /> {vca.medianWords}
          </div>
          <div className="text-3xl font-bold text-bright">
            {wcStats.median != null ? Math.round(wcStats.median).toLocaleString() : sj.emDash}
          </div>
          <div className="text-xs text-slate-500 mt-1">{vca.perPage}</div>
        </Card>

        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" /> {vca.ogCoverage}
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {sc.og_coverage_pct != null ? `${sc.og_coverage_pct}%` : sj.emDash}
          </div>
          <div className="text-xs text-slate-500 mt-1">{vca.ogTags}</div>
        </Card>

        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Twitter className="h-4 w-4 text-sky-400" /> {vca.twitterCoverage}
          </div>
          <div className="text-3xl font-bold text-sky-400">
            {sc.twitter_coverage_pct != null ? `${sc.twitter_coverage_pct}%` : sj.emDash}
          </div>
          <div className="text-xs text-slate-500 mt-1">{vca.twitterTags}</div>
        </Card>

        <Card
          shadow
          className={hasThinPages ? 'ring-1 ring-amber-500/20 border-amber-900/30' : ''}
        >
          <div className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${hasThinPages ? 'text-amber-400/80' : 'text-slate-500'}`}>
            <AlertTriangle className={`h-4 w-4 ${hasThinPages ? 'text-amber-400' : ''}`} /> {vca.thinPages}
          </div>
          <div className={`text-3xl font-bold ${hasThinPages ? 'text-amber-400' : 'text-slate-500'}`}>
            {thinPages.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{vca.under300}</div>
        </Card>
      </div>

      {Array.isArray(data?.links) && data.links.length > 0 && (
        <Card shadow>
          <BrowserMlPanel links={data.links} />
        </Card>
      )}

      {(data.hreflang_summary?.pages_200 > 0 || (data.outbound_link_domains?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.hreflang_summary?.pages_200 > 0 && (
            <Card padding="tight" shadow>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-bold text-slate-200">{vca.i18nTitle}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-brand-900 border border-default rounded-lg p-3">
                  <div className="text-slate-500 text-xs uppercase tracking-wider">{vca.pages2xx}</div>
                  <div className="text-xl font-bold text-slate-200">{data.hreflang_summary.pages_200}</div>
                </div>
                <div className="bg-brand-900 border border-default rounded-lg p-3">
                  <div className="text-slate-500 text-xs uppercase tracking-wider">{vca.missingHtmlLang}</div>
                  <div className="text-xl font-bold text-amber-400">{data.hreflang_summary.pages_missing_html_lang ?? sj.emDash}</div>
                </div>
                <div className="bg-brand-900 border border-default rounded-lg p-3 col-span-2">
                  <div className="text-slate-500 text-xs uppercase tracking-wider">{vca.pagesHreflang}</div>
                  <div className="text-xl font-bold text-sky-400">{data.hreflang_summary.pages_with_hreflang_links ?? sj.emDash}</div>
                </div>
              </div>
            </Card>
          )}
          {(data.outbound_link_domains?.length ?? 0) > 0 && (
            <Card padding="tight" shadow className={data.hreflang_summary?.pages_200 ? '' : 'lg:col-span-2'}>
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-orange-400" />
                <h3 className="text-sm font-bold text-slate-200">{vca.outboundDomains}</h3>
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
                    {data.outbound_link_domains.map((row) => (
                      <TableRow key={row.host}>
                        <TableCell className="font-mono text-xs text-slate-300">{row.host}</TableCell>
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
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-slate-200">{vca.languageMix}</h3>
          </div>
          <div className="h-56">
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
          </div>
        </Card>
      )}

      {nerSiteChart && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-200">{vca.entityLabels}</h3>
          </div>
          <div className="h-56">
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
              options={barOptsH()}
            />
          </div>
        </Card>
      )}

      {data.keyword_opportunities?.token_topic_clusters?.length > 0 && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-200">{vca.parentTopicsToken}</h3>
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
                {data.keyword_opportunities.token_topic_clusters.map((cl, idx) => (
                  <TableRow key={`tok-${cl.top_keyword}-${idx}`}>
                    <TableCell className="font-medium text-slate-200">{cl.top_keyword}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">{cl.cluster_score ?? sj.emDash}</TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {Array.isArray(cl.keywords) ? cl.keywords.join(', ') : sj.emDash}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {data.semantic_keyword_clusters?.length > 0 && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">{vca.parentTopicsSemantic}</h3>
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
                {data.semantic_keyword_clusters.map((cl, idx) => (
                  <TableRow key={`${cl.top_keyword}-${idx}`}>
                    <TableCell className="font-medium text-slate-200">{cl.top_keyword}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">{cl.cluster_score ?? sj.emDash}</TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {Array.isArray(cl.keywords) ? cl.keywords.join(', ') : sj.emDash}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {(hasStatusChart || hasRtDist) && (
        <div className="space-y-6">
          <SectionHeader icon={Activity} title={vca.crawlHealth} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hasStatusChart && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-1">{vca.urlsByStatus}</h3>
                <p className="text-xs text-slate-500 mb-3">
                  {vca.totalCrawled}{' '}
                  <span className="text-slate-300 font-semibold">{Number(summary.total_urls || 0).toLocaleString()}</span>
                  {summary.success_rate != null && (
                    <> · <span className="text-green-400 font-semibold">{summary.success_rate}%</span> {vca.returned2xx}
                    </>
                  )}
                </p>
                <div className="h-64 flex items-center justify-center">
                  <div className="w-full max-w-[280px] h-56">
                    <Doughnut
                      data={{
                        labels: statusDoughnut.labels,
                        datasets: [
                          {
                            data: statusDoughnut.values,
                            backgroundColor: palette(statusDoughnut.labels.length),
                            borderColor: 'rgba(15,23,42,0.8)',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        ...doughnutOpts(),
                        plugins: {
                          ...doughnutOpts().plugins,
                          tooltip: {
                            callbacks: {
                              label: (ctx) => {
                                const n = Number(ctx.raw);
                                const sum = statusDoughnut.values.reduce((a, b) => a + b, 0);
                                const pct = sum ? ((100 * n) / sum).toFixed(1) : '0';
                                return ` ${ctx.label}: ${n.toLocaleString()} (${pct}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              </Card>
            )}
            {hasRtDist && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-1">{vca.responseTimeDist}</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Pages per latency band
                  {rtStats.p50 != null && (
                    <>
                      {' '}
                      · p50: <span className="text-slate-300 font-mono">{Math.round(rtStats.p50)}ms</span>
                      {rtStats.p95 != null && (
                        <>
                          , p95: <span className="text-slate-300 font-mono">{Math.round(rtStats.p95)}ms</span>
                        </>
                      )}
                    </>
                  )}
                </p>
                <div className="h-64">
                  <Bar
                    data={{
                      labels: rtLabels,
                      datasets: [{ data: rtValues, backgroundColor: palette(rtLabels.length) }],
                    }}
                    options={{
                      ...barOpts(ch.timeBucket),
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} URLs` } },
                      },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {(hasIssueBar || hasSeoOptimalBar || hasThinCompare) && (
        <div className="space-y-6">
          <SectionHeader icon={ListChecks} title={vca.onPageQuality} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hasIssueBar && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-3">URLs flagged by issue type</h3>
                <div className="h-80">
                  <Bar
                    data={{
                      labels: issueBarLabels,
                      datasets: [{ data: issueBarValues, backgroundColor: palette(issueBarLabels.length) }],
                    }}
                    options={{
                      ...barOptsH(),
                      plugins: {
                        ...barOptsH().plugins,
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} URLs` } },
                      },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                </div>
              </Card>
            )}
            {hasSeoOptimalBar && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-3">Pages in “good” ranges</h3>
                <div className="h-56">
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
                </div>
              </Card>
            )}
            {hasThinCompare && (
              <Card padding="tight" className={hasIssueBar && hasSeoOptimalBar ? 'lg:col-span-2' : ''}>
                <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.thinSignals}</h3>
                <div className="h-48 max-w-md">
                  <Bar
                    data={{
                      labels: ['Under 300 words', 'Small HTML body'],
                      datasets: [
                        {
                          label: 'Page count',
                          data: [thinByWords, thinByChars],
                          backgroundColor: ['#F59E0B', '#DC2626'],
                        },
                      ],
                    }}
                    options={{
                      ...barOpts(vca.thPages),
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } },
                      },
                    }}
                    plugins={[barValueLabelsPlugin]}
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
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">
              {q
                ? `${thinPagesFiltered.length} of ${thinPages.length} thin page${thinPages.length !== 1 ? 's' : ''} match search`
                : `${thinPages.length} page${thinPages.length !== 1 ? 's' : ''} have very little content`}
            </span>
          </div>
          {thinPagesFiltered.length > 0 ? (
            <ThinPagesSection pages={thinPagesFiltered} />
          ) : (
            <p className="text-sm text-slate-500">{vca.noThinSearch}</p>
          )}
        </Card>
      )}

      {/* Content Metrics section */}
      <div className="space-y-6">
        <SectionHeader icon={BarChart2} title={vca.contentMetrics} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.wordCountDist}</h3>
            <div className="h-64">
              {wcLabels.length > 0 ? (
                <Bar
                  data={{ labels: wcLabels, datasets: [{ data: wcValues, backgroundColor: palette(wcLabels.length) }] }}
                  options={barOpts(ch.axisWordCount)}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>

          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.readingLevelDist}</h3>
            <div className="h-64">
              {rlLabels.length > 0 ? (
                <Bar
                  data={{
                    labels: rlLabels,
                    datasets: [{ data: rlValues, backgroundColor: ['#22C55E', '#4C72B0', '#EAB308', '#EF4444'].slice(0, rlLabels.length) }],
                  }}
                  options={{ ...barOptsH(), plugins: { ...barOptsH().plugins, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} pages` } } } }}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>

          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.contentHtmlRatio}</h3>
            <div className="h-64">
              {crLabels.length > 0 ? (
                <Bar
                  data={{ labels: crLabels, datasets: [{ data: crValues, backgroundColor: palette(crLabels.length) }] }}
                  options={barOpts(ch.ratio)}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>

          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.topKeywords}</h3>
            <div className="h-[28rem]">
              {kwLabels.length > 0 ? (
                <Bar
                  data={{ labels: kwLabels, datasets: [{ data: kwValues, backgroundColor: PALETTE_CATEGORICAL[0] }] }}
                  options={barOptsH()}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">{vca.noKeywordData}</div>
              )}
            </div>
          </Card>

          {hasWcPercBar && (
            <Card padding="tight" className="lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.wordCountLadder}</h3>
              <div className="h-56">
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
                          label: (ctx) => ` ${Number(ctx.raw).toLocaleString()} words`,
                        },
                      },
                    },
                    scales: {
                      x: { grid: { color: GRID_COLOR }, title: { display: true, text: 'Statistic', color: '#64748b' } },
                      y: {
                        grid: { color: GRID_COLOR },
                        beginAtZero: true,
                        title: { display: true, text: 'Words', color: '#64748b' },
                      },
                    },
                  }}
                  plugins={[barValueLabelsPlugin]}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* On-Page SEO Signals section */}
      {(hasH1Data || hasTitleData || hasMetaData) && (
        <div className="space-y-6">
          <SectionHeader icon={Tag} title={vca.onPageSignals} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* H1 Distribution Doughnut */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.h1Dist}</h3>
              <div className="h-56">
                {hasH1Data ? (
                  <Doughnut
                    data={{
                      labels: h1Labels,
                      datasets: [{
                        data: h1Values,
                        backgroundColor: ['#EF4444', '#22C55E', '#DD8452'],
                        borderColor: 'rgba(15,23,42,0.8)',
                        borderWidth: 2,
                      }],
                    }}
                    options={doughnutOpts()}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
                )}
              </div>
            </Card>

            {/* Title Length Quality */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.titleTagQuality}</h3>
              <div className="h-56">
                {hasTitleData ? (
                  <Bar
                    data={{
                      labels: titleQualLabels,
                      datasets: [{ data: titleQualValues, backgroundColor: qualityBarColors(titleQualLabels) }],
                    }}
                    options={{
                      ...barOpts(),
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } } },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
                )}
              </div>
            </Card>

            {/* Meta Description Quality */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.metaDescQuality}</h3>
              <div className="h-56">
                {hasMetaData ? (
                  <Bar
                    data={{
                      labels: metaQualLabels,
                      datasets: [{ data: metaQualValues, backgroundColor: qualityBarColors(metaQualLabels) }],
                    }}
                    options={{
                      ...barOpts(),
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } } },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
                )}
              </div>
            </Card>
          </div>

          {(hasTitleMetaCompare || hasSeoGapCountCompare) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {hasTitleMetaCompare && (
                <Card padding="tight">
                  <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.titleVsMetaBuckets}</h3>
                  <div className="h-64">
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
                  </div>
                </Card>
              )}
              {hasSeoGapCountCompare && (
                <Card padding="tight">
                  <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.seoOptimalVsGapCounts}</h3>
                  <div className="h-64">
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
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* Social Meta Coverage section */}
      <div className="space-y-6">
        <SectionHeader icon={Share2} title={vca.socialMetaCoverage} />

        {/* Coverage progress bars */}
        {(sc.og_coverage_pct != null || sc.twitter_coverage_pct != null) && (
          <Card shadow>
            <div className="space-y-4">
              {sc.og_coverage_pct != null && (
                <CoverageBar label={vca.ogProgress} pct={sc.og_coverage_pct} color="text-blue-400" />
              )}
              {sc.twitter_coverage_pct != null && (
                <CoverageBar label={vca.twitterProgress} pct={sc.twitter_coverage_pct} color="text-sky-400" />
              )}
            </div>
          </Card>
        )}

        {/* Social meta visual comparison */}
        {hasSocialData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Grouped bar: OG / Twitter / OG Image coverage */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.socialOverview}</h3>
              <div className="h-64">
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
                      x: { stacked: true, grid: { color: GRID_COLOR } },
                      y: { stacked: true, grid: { color: GRID_COLOR }, beginAtZero: true, max: 100, title: { display: true, text: 'Coverage %', color: '#64748b' } },
                    },
                    plugins: {
                      legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
                      tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw?.toFixed(1)}%` } },
                    },
                  }}
                />
              </div>
            </Card>

            {/* OG Image coverage doughnut */}
            {hasOgImgData && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-3">OG Image Coverage</h3>
                <div className="h-64">
                  <Doughnut
                    data={{
                      labels: ['Has OG Image', 'Missing OG Image'],
                      datasets: [{
                        data: [ogImgPct, ogImgMissingPct],
                        backgroundColor: ['#4C72B0', '#EF444466'],
                        borderColor: 'rgba(15,23,42,0.8)',
                        borderWidth: 2,
                      }],
                    }}
                    options={{
                      ...doughnutOpts(),
                      plugins: {
                        ...doughnutOpts().plugins,
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw?.toFixed(1)}%` } },
                      },
                    }}
                  />
                </div>
              </Card>
            )}
          </div>
        )}

        {hasSocialMissCompare && (
          <Card padding="tight" shadow>
            <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.missingSocialUrlCompare}</h3>
            <div className="h-56 max-w-lg">
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
                        label: (ctx) => ` ${ctx.raw?.toLocaleString()} ${sj.urls}`,
                      },
                    },
                  },
                  scales: {
                    x: { grid: { color: GRID_COLOR } },
                    y: {
                      grid: { color: GRID_COLOR },
                      beginAtZero: true,
                      title: { display: true, text: sj.urls, color: '#64748b' },
                    },
                  },
                }}
                plugins={[barValueLabelsPlugin]}
              />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(sc.missing_og || []).length > 0 && (
            <Card overflowHidden padding="none">
              <div className="px-4 py-3 border-b border-muted flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-slate-200">Missing Open Graph Tags</h3>
                <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-700/60 rounded-full px-2.5 py-0.5">
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
                        <TableCell className="text-slate-600 text-xs font-mono text-center w-8">{i + 1}</TableCell>
                        <TableCell className="max-w-[360px]">
                          <a
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            title={u}
                            className="block font-mono text-blue-400 text-xs truncate hover:text-blue-300 hover:underline transition-colors"
                          >
                            {u}
                          </a>
                        </TableCell>
                        <TableCell className="w-8">
                          <ExternalLink className="h-3.5 w-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                ) : (
                  <p className="p-4 text-sm text-slate-500">{vca.noUrlSearch}</p>
                )}
              </div>
            </Card>
          )}

          {(sc.missing_twitter || []).length > 0 && (
            <Card overflowHidden padding="none">
              <div className="px-4 py-3 border-b border-muted flex items-center gap-2">
                <Twitter className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-bold text-slate-200">Missing Twitter Card Tags</h3>
                <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-700/60 rounded-full px-2.5 py-0.5">
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
                        <TableCell className="text-slate-600 text-xs font-mono text-center w-8">{i + 1}</TableCell>
                        <TableCell className="max-w-[360px]">
                          <a
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            title={u}
                            className="block font-mono text-blue-400 text-xs truncate hover:text-blue-300 hover:underline transition-colors"
                          >
                            {u}
                          </a>
                        </TableCell>
                        <TableCell className="w-8">
                          <ExternalLink className="h-3.5 w-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                ) : (
                  <p className="p-4 text-sm text-slate-500">{vca.noUrlSearch}</p>
                )}
              </div>
            </Card>
          )}

          {(sc.missing_og || []).length === 0 && (sc.missing_twitter || []).length === 0 && (
            <Card className="col-span-2 flex items-center gap-3 py-6">
              <Share2 className="h-8 w-8 text-green-500" />
              <p className="text-slate-400 text-sm">All pages have social meta tags, or no data available yet. Run a crawl to populate.</p>
            </Card>
          )}
        </div>
      </div>
      {/* Site Architecture section */}
      {hasDepthData && (
        <div className="space-y-6">
          <SectionHeader icon={Layers} title={vca.siteArchitecture} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-3">Crawl Depth Distribution</h3>
              {(depthDist.max_depth != null || depthDist.avg_depth != null) && (
                <p className="text-xs text-slate-500 mb-3">
                  {depthDist.max_depth != null && (
                    <>
                      Max depth: <span className="text-slate-300 font-semibold">{depthDist.max_depth}</span>
                    </>
                  )}
                  {depthDist.max_depth != null && depthDist.avg_depth != null && ' · '}
                  {depthDist.avg_depth != null && (
                    <>
                      avg: <span className="text-slate-300 font-semibold">{depthDist.avg_depth}</span>
                    </>
                  )}
                </p>
              )}
              <div className="h-64">
                <Bar
                  data={{
                    labels: depthLabels,
                    datasets: [{ data: depthValues, backgroundColor: palette(depthLabels.length) }],
                  }}
                  options={{
                    ...barOpts(ch.depth),
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } },
                    },
                  }}
                  plugins={[barValueLabelsPlugin]}
                />
              </div>
            </Card>

            {/* Word count percentile summary */}
            {wcStats.median != null && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-3">{vca.wordCountPercentiles}</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Min', value: wcStats.min, color: 'text-slate-400', barW: 0 },
                    { label: '25th Percentile (P25)', value: wcStats.p25, color: 'text-amber-400', barW: 25 },
                    { label: 'Median (P50)', value: wcStats.median, color: 'text-blue-400', barW: 50 },
                    { label: 'Mean (Avg)', value: wcStats.mean, color: 'text-purple-400', barW: null },
                    { label: '75th Percentile (P75)', value: wcStats.p75, color: 'text-green-400', barW: 75 },
                    { label: 'Max', value: wcStats.max, color: 'text-slate-300', barW: 100 },
                  ].map(({ label, value, color, barW }) => {
                    const pct = barW != null ? barW : wcStats.max > 0 ? Math.min(100, (value / wcStats.max) * 100) : 0;
                    return (
                      <div key={label} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">{label}</span>
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
    </PageLayout>
  );
}
