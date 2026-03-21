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
} from 'lucide-react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { palette, PALETTE_CATEGORICAL } from '../utils/chartPalette';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

const barValueLabelsPlugin = {
  id: 'caBarLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;
    const dataset = chart.data.datasets?.[0];
    if (!dataset?.data) return;
    const isHorizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgb(203, 213, 225)';
    ctx.textAlign = isHorizontal ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    meta.data.forEach((bar, i) => {
      const value = dataset.data[i];
      if (value == null || value === 0) return;
      const label = Number(value).toLocaleString();
      const x = isHorizontal ? bar.x + 6 : bar.x;
      const y = isHorizontal ? bar.y : bar.y - 12;
      ctx.fillText(label, x, y);
    });
    ctx.restore();
  },
};

function barOpts(xTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw} pages` } } },
    scales: {
      x: { grid: { color: GRID_COLOR }, ...(xTitle ? { title: { display: true, text: xTitle } } : {}) },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Pages' } },
    },
  };
}

function barOptsH() {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw}` } } },
    scales: {
      x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Frequency' } },
      y: { grid: { color: GRID_COLOR } },
    },
  };
}

function doughnutOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12 } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw?.toLocaleString()} pages` } },
    },
  };
}

function groupedBarOpts(yTitle = 'Pages') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw?.toLocaleString()} pages` } },
    },
    scales: {
      x: { grid: { color: GRID_COLOR } },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: yTitle, color: '#64748b' } },
    },
  };
}

function stackedPercentBarOpts() {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: GRID_COLOR },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: '% of pages', color: '#64748b' },
      },
      y: { stacked: true, grid: { color: GRID_COLOR } },
    },
  };
}

const CONTENT_ISSUE_KEYS = [
  { key: 'missing_h1', label: 'Missing H1' },
  { key: 'missing_title', label: 'Missing title' },
  { key: 'multiple_h1', label: 'Multiple H1s' },
  { key: 'missing_meta_desc', label: 'Missing meta desc' },
  { key: 'meta_desc_short', label: 'Meta too short' },
  { key: 'meta_desc_long', label: 'Meta too long' },
  { key: 'thin_content', label: 'Thin (body chars)' },
];

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
  if (!pages || pages.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors py-1"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        View {pages.length} thin page{pages.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-muted">
          <Table>
            <TableHead sticky>
              <tr>
                <TableHeadCell className="w-8 text-center">#</TableHeadCell>
                <TableHeadCell className="min-w-[260px]">URL</TableHeadCell>
                <TableHeadCell className="w-20 text-center">Words</TableHeadCell>
                <TableHeadCell className="w-8" />
              </tr>
            </TableHead>
            <TableBody striped>
              {pages.map((p, i) => {
                const url = typeof p === 'string' ? p : (p.url || '—');
                const wc = typeof p === 'object' ? p.word_count : null;
                return (
                  <TableRow key={i} className="group">
                    <TableCell className="text-slate-600 text-xs font-mono text-center w-8">{i + 1}</TableCell>
                    <TableCell className="max-w-[360px]">
                      <a
                        href={url !== '—' ? url : undefined}
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
  const h1Labels = ['No H1', 'One H1', 'Multiple H1s'];
  const h1Values = [seoHealth.h1_zero || 0, seoHealth.h1_one || 0, seoHealth.h1_multi || 0];
  const hasH1Data = h1Values.some((v) => v > 0);

  // --- Title length quality ---
  const titleQualLabels = ['Missing', 'Too Short (<30)', 'Optimal (30–60)', 'Too Long (>60)'];
  const titleQualValues = [
    seoHealth.missing_title || 0,
    seoHealth.title_short || 0,
    seoHealth.title_ok || 0,
    seoHealth.title_long || 0,
  ];
  const hasTitleData = titleQualValues.some((v) => v > 0);

  // --- Meta description quality ---
  const metaQualLabels = ['Missing', 'Too Short (<70)', 'Optimal (70–160)', 'Too Long (>160)'];
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

  const issueBarLabels = CONTENT_ISSUE_KEYS.map((r) => r.label);
  const issueBarValues = CONTENT_ISSUE_KEYS.map((r) => (contentUrls[r.key] || []).length);
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

  const wcPercLabels = ['Min', 'P25', 'Median', 'Mean', 'P75', 'Max'];
  const wcPercRaw = [wcStats.min, wcStats.p25, wcStats.median, wcStats.mean, wcStats.p75, wcStats.max];
  const wcPercValues = wcPercRaw.map((v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null));
  const hasWcPercBar = wcPercValues.every((v) => v != null) && wcStats.max > 0;

  return (
    <PageLayout className="space-y-8">
      <PageHeader
        title="Content Insights"
        subtitle="Word count, readability, content-to-HTML ratio, top keywords, social meta coverage, crawl health, and on-page flags."
      />

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Mean Words
          </div>
          <div className="text-3xl font-bold text-bright">
            {wcStats.mean != null ? Math.round(wcStats.mean).toLocaleString() : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">per page</div>
        </Card>

        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Median Words
          </div>
          <div className="text-3xl font-bold text-bright">
            {wcStats.median != null ? Math.round(wcStats.median).toLocaleString() : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">per page</div>
        </Card>

        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" /> OG Coverage
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {sc.og_coverage_pct != null ? `${sc.og_coverage_pct}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">open graph tags</div>
        </Card>

        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Twitter className="h-4 w-4 text-sky-400" /> Twitter Coverage
          </div>
          <div className="text-3xl font-bold text-sky-400">
            {sc.twitter_coverage_pct != null ? `${sc.twitter_coverage_pct}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">twitter card tags</div>
        </Card>

        <Card
          shadow
          className={hasThinPages ? 'ring-1 ring-amber-500/20 border-amber-900/30' : ''}
        >
          <div className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${hasThinPages ? 'text-amber-400/80' : 'text-slate-500'}`}>
            <AlertTriangle className={`h-4 w-4 ${hasThinPages ? 'text-amber-400' : ''}`} /> Thin Pages
          </div>
          <div className={`text-3xl font-bold ${hasThinPages ? 'text-amber-400' : 'text-slate-500'}`}>
            {thinPages.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">under 300 words</div>
        </Card>
      </div>

      {languageMlChart && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-slate-200">Language mix (optional ML)</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            From <code className="text-slate-400">enable_language_detection</code> during report. Sampled pages with enough text.
          </p>
          <div className="h-56">
            <Bar
              data={{
                labels: languageMlChart.labels,
                datasets: [
                  {
                    label: 'Pages',
                    data: languageMlChart.values,
                    backgroundColor: palette(languageMlChart.labels.length),
                  },
                ],
              }}
              options={barOpts('Pages')}
            />
          </div>
        </Card>
      )}

      {nerSiteChart && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-200">Entity labels (spaCy NER, sampled pages)</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Aggregated from <code className="text-slate-400">enable_ner_spacy</code>
            {data.ner_site_summary?.pages_with_ner != null && (
              <>
                {' '}
                · {data.ner_site_summary.pages_with_ner} page(s) · {data.ner_site_summary.total_entities ?? '—'} total entities
              </>
            )}
          </p>
          <div className="h-56">
            <Bar
              data={{
                labels: nerSiteChart.labels,
                datasets: [
                  {
                    label: 'Count',
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

      {data.semantic_keyword_clusters?.length > 0 && (
        <Card padding="tight" shadow>
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">Semantic keyword clusters</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            From <code className="text-slate-400">enable_semantic_keywords</code> — phrases grouped by sentence-transformer similarity (site-wide keyword rollup).
          </p>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-muted">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Representative</TableHeadCell>
                  <TableHeadCell>Cluster score</TableHeadCell>
                  <TableHeadCell>Keywords</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.semantic_keyword_clusters.map((cl, idx) => (
                  <TableRow key={`${cl.top_keyword}-${idx}`}>
                    <TableCell className="font-medium text-slate-200">{cl.top_keyword}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">{cl.cluster_score ?? '—'}</TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {Array.isArray(cl.keywords) ? cl.keywords.join(', ') : '—'}
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
          <SectionHeader
            icon={Activity}
            title="Crawl health & response times"
            description="HTTP status mix for this crawl, plus response-time buckets (p50 / p95 noted). Helps relate content metrics to crawl success and speed."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hasStatusChart && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-1">URLs by HTTP status</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Total crawled:{' '}
                  <span className="text-slate-300 font-semibold">{Number(summary.total_urls || 0).toLocaleString()}</span>
                  {summary.success_rate != null && (
                    <> · <span className="text-green-400 font-semibold">{summary.success_rate}%</span> returned 2xx
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
                <h3 className="text-sm font-bold text-slate-200 mb-1">Response time distribution</h3>
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
                      ...barOpts('Time bucket'),
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
          <SectionHeader
            icon={ListChecks}
            title="On-page quality & thin content"
            description="Flagged URL counts, share of pages in ideal title/meta/H1 ranges, and thin-content signals (words vs HTML body)."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hasIssueBar && (
              <Card padding="tight">
                <h3 className="text-sm font-bold text-slate-200 mb-1">URLs flagged by issue type</h3>
                <p className="text-xs text-slate-500 mb-3">Same buckets as the On-Page SEO report — how many URLs per issue</p>
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
                <h3 className="text-sm font-bold text-slate-200 mb-1">Pages in “good” ranges</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Title 30–60 chars, meta 70–160 chars, exactly one H1 — stacked % of all crawled HTML rows in the dataset
                </p>
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
                <h3 className="text-sm font-bold text-slate-200 mb-1">Thin content signals</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Under 300 words (content analytics) vs. small HTML body by character count (SEO health threshold)
                </p>
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
                      ...barOpts('Pages'),
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
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">
              {q
                ? `${thinPagesFiltered.length} of ${thinPages.length} thin page${thinPages.length !== 1 ? 's' : ''} match search`
                : `${thinPages.length} page${thinPages.length !== 1 ? 's' : ''} have very little content`}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Pages under ~300 words may be seen as low-value by search engines. Consider expanding or consolidating them.
          </p>
          {thinPagesFiltered.length > 0 ? (
            <ThinPagesSection pages={thinPagesFiltered} />
          ) : (
            <p className="text-sm text-slate-500">No thin pages match your search.</p>
          )}
        </Card>
      )}

      {/* Content Metrics section */}
      <div className="space-y-6">
        <SectionHeader
          icon={BarChart2}
          title="Content Metrics"
          description="Distribution of word count, reading level, and content ratio across all crawled pages."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Word Count Distribution</h3>
            <p className="text-xs text-slate-500 mb-3">Pages grouped by word count bucket</p>
            <div className="h-64">
              {wcLabels.length > 0 ? (
                <Bar
                  data={{ labels: wcLabels, datasets: [{ data: wcValues, backgroundColor: palette(wcLabels.length) }] }}
                  options={barOpts('Word Count')}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
              )}
            </div>
          </Card>

          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Reading Level Distribution</h3>
            <p className="text-xs text-slate-500 mb-3">Flesch-Kincaid grade level bands</p>
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
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
              )}
            </div>
          </Card>

          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Content-to-HTML Ratio</h3>
            <p className="text-xs text-slate-500 mb-3">Text content percentage of total HTML size</p>
            <div className="h-64">
              {crLabels.length > 0 ? (
                <Bar
                  data={{ labels: crLabels, datasets: [{ data: crValues, backgroundColor: palette(crLabels.length) }] }}
                  options={barOpts('Ratio')}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
              )}
            </div>
          </Card>

          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Top 30 Keywords (Site-Wide)</h3>
            <p className="text-xs text-slate-500 mb-3">Most frequent meaningful words across all pages</p>
            <div className="h-[28rem]">
              {kwLabels.length > 0 ? (
                <Bar
                  data={{ labels: kwLabels, datasets: [{ data: kwValues, backgroundColor: PALETTE_CATEGORICAL[0] }] }}
                  options={barOptsH()}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No keyword data</div>
              )}
            </div>
          </Card>

          {hasWcPercBar && (
            <Card padding="tight" className="lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Word count ladder (min → max)</h3>
              <p className="text-xs text-slate-500 mb-3">Key percentiles and mean — same numbers as the architecture card, shown as bars</p>
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
          <SectionHeader
            icon={Tag}
            title="On-Page SEO Signals"
            description="H1 structure, title tag length, and meta description quality across all crawled pages."
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* H1 Distribution Doughnut */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-1">H1 Tag Distribution</h3>
              <p className="text-xs text-slate-500 mb-3">Pages by H1 heading count</p>
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
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
                )}
              </div>
            </Card>

            {/* Title Length Quality */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Title Tag Length Quality</h3>
              <p className="text-xs text-slate-500 mb-3">Optimal range: 30–60 characters</p>
              <div className="h-56">
                {hasTitleData ? (
                  <Bar
                    data={{
                      labels: titleQualLabels,
                      datasets: [{ data: titleQualValues, backgroundColor: qualityBarColors(titleQualLabels) }],
                    }}
                    options={{
                      ...barOpts(''),
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } } },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
                )}
              </div>
            </Card>

            {/* Meta Description Quality */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Meta Description Quality</h3>
              <p className="text-xs text-slate-500 mb-3">Optimal range: 70–160 characters</p>
              <div className="h-56">
                {hasMetaData ? (
                  <Bar
                    data={{
                      labels: metaQualLabels,
                      datasets: [{ data: metaQualValues, backgroundColor: qualityBarColors(metaQualLabels) }],
                    }}
                    options={{
                      ...barOpts(''),
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } } },
                    }}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Social Meta Coverage section */}
      <div className="space-y-6">
        <SectionHeader
          icon={Share2}
          title="Social Meta Coverage"
          description="Open Graph and Twitter Card tag coverage across all crawled pages."
        />

        {/* Coverage progress bars */}
        {(sc.og_coverage_pct != null || sc.twitter_coverage_pct != null) && (
          <Card shadow>
            <div className="space-y-4">
              {sc.og_coverage_pct != null && (
                <CoverageBar label="Open Graph Coverage" pct={sc.og_coverage_pct} color="text-blue-400" />
              )}
              {sc.twitter_coverage_pct != null && (
                <CoverageBar label="Twitter Card Coverage" pct={sc.twitter_coverage_pct} color="text-sky-400" />
              )}
            </div>
          </Card>
        )}

        {/* Social meta visual comparison */}
        {hasSocialData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Grouped bar: OG / Twitter / OG Image coverage */}
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Social Meta Coverage Overview</h3>
              <p className="text-xs text-slate-500 mb-3">% of pages with each social meta tag present</p>
              <div className="h-64">
                <Bar
                  data={{
                    labels: ['Open Graph', 'Twitter Card', 'OG Image'],
                    datasets: [
                      {
                        label: 'Has Tag',
                        data: [ogPct, twPct, ogImgPct],
                        backgroundColor: '#22C55E',
                      },
                      {
                        label: 'Missing',
                        data: [100 - ogPct, 100 - twPct, 100 - ogImgPct],
                        backgroundColor: '#EF444466',
                      },
                    ],
                  }}
                  options={{
                    ...groupedBarOpts('%'),
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
                <h3 className="text-sm font-bold text-slate-200 mb-1">OG Image Coverage</h3>
                <p className="text-xs text-slate-500 mb-3">Pages with and without an Open Graph image</p>
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
                  <p className="p-4 text-sm text-slate-500">No URLs match your search.</p>
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
                  <p className="p-4 text-sm text-slate-500">No URLs match your search.</p>
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
          <SectionHeader
            icon={Layers}
            title="Site Architecture"
            description="Crawl depth distribution shows how many pages exist at each level from the root."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Crawl Depth Distribution</h3>
              <p className="text-xs text-slate-500 mb-3">
                Pages per depth level — Depth 0 is the root, Depth 1 is one click away, etc.
                {depthDist.max_depth != null && (
                  <> Max depth: <span className="text-slate-300 font-semibold">{depthDist.max_depth}</span>
                  {depthDist.avg_depth != null && <>, avg: <span className="text-slate-300 font-semibold">{depthDist.avg_depth}</span></>}.</>
                )}
              </p>
              <div className="h-64">
                <Bar
                  data={{
                    labels: depthLabels,
                    datasets: [{ data: depthValues, backgroundColor: palette(depthLabels.length) }],
                  }}
                  options={{
                    ...barOpts('Depth'),
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
                <h3 className="text-sm font-bold text-slate-200 mb-1">Word Count Percentiles</h3>
                <p className="text-xs text-slate-500 mb-4">Distribution of word counts across all pages</p>
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
