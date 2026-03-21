import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Globe, CheckCircle, AlertTriangle, FileCode, BookOpen, Share, Cpu, Timer, ExternalLink, TrendingUp, Link2, ChevronRight, Lightbulb, BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { palette, scoreBandColor, sortByValue, PALETTE_CATEGORICAL } from '../utils/chartPalette';

const REC_COLORS = [
  { border: 'border-l-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-500'   },
  { border: 'border-l-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  dot: 'bg-amber-500'  },
  { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-500' },
  { border: 'border-l-green-500',  bg: 'bg-green-500/10',  text: 'text-green-400',  dot: 'bg-green-500'  },
  { border: 'border-l-rose-500',   bg: 'bg-rose-500/10',   text: 'text-rose-400',   dot: 'bg-rose-500'   },
  { border: 'border-l-cyan-500',   bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   dot: 'bg-cyan-500'   },
];

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

const WC_BUCKET_ORDER = ['0-100', '101-300', '301-600', '601-1000', '1001-2000', '2001+'];
const RT_BUCKET_ORDER = ['<200ms', '200-500ms', '500ms-1s', '1-2s', '>2s'];
const RL_BUCKET_ORDER = ['Elementary (0-5)', 'Middle School (6-8)', 'High School (9-12)', 'College (13+)'];

const LH_CAT_LABELS = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best practices',
  seo: 'SEO',
  pwa: 'PWA',
};
const LH_CAT_ORDER = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];

if (typeof ChartJS.defaults?.font !== 'undefined') {
  ChartJS.defaults.font.size = 11;
  ChartJS.defaults.color = 'rgb(203, 213, 225)';
}

function barOptsVertical(yTitle, ariaDescription) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${Number(ctx.raw).toLocaleString()} pages` } },
    },
    scales: {
      x: { grid: { color: GRID_COLOR } },
      y: {
        grid: { color: GRID_COLOR },
        beginAtZero: true,
        title: { display: true, text: yTitle, color: '#64748b' },
      },
    },
    ...(ariaDescription ? { aria: { description: ariaDescription } } : {}),
  };
}

function barOptsGrouped(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 },
      },
      tooltip: {
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString()} pages` },
      },
    },
    scales: {
      x: { grid: { color: GRID_COLOR } },
      y: {
        grid: { color: GRID_COLOR },
        beginAtZero: true,
        title: { display: true, text: yTitle, color: '#64748b' },
      },
    },
  };
}

function barOptsSocial() {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${Number(ctx.raw).toFixed(1)}% of HTML pages`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: GRID_COLOR },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: '% of pages', color: '#64748b' },
      },
      y: { grid: { color: GRID_COLOR } },
    },
  };
}

function barOptsLighthouse() {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.raw;
            return v == null ? ' No score' : ` ${Number(v)} / 100`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: GRID_COLOR },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: 'Score', color: '#64748b' },
      },
      y: { grid: { color: GRID_COLOR } },
    },
  };
}

function sumObject(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce((a, v) => a + Number(v || 0), 0);
}

export default function Overview({ searchQuery = '' }) {
  const { data } = useReport();
  const q = (searchQuery || '').toLowerCase().trim();
  const categoriesFiltered = useMemo(() => {
    const cats = data?.categories || [];
    if (!q) return cats;
    return cats.filter((cat) => (cat.name || cat.id || '').toLowerCase().includes(q));
  }, [data?.categories, q]);
  const recommendationsFiltered = useMemo(() => {
    const recs = data?.recommendations || [];
    if (!q) return recs;
    return recs.filter((r) => String(r).toLowerCase().includes(q));
  }, [data?.recommendations, q]);
  const topPagesFiltered = useMemo(() => {
    const pages = data?.top_pages || [];
    if (!q) return pages;
    return pages.filter((p) => {
      const u = (p.url || '').toLowerCase();
      const t = (p.title || '').toLowerCase();
      return u.includes(q) || t.includes(q);
    });
  }, [data?.top_pages, q]);

  const wordCountChart = useMemo(() => {
    const dist = data?.content_analytics?.word_count_distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = WC_BUCKET_ORDER.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    const aria = `Word count buckets for successful HTML pages: ${labels.map((l, i) => `${values[i]} in ${l} words`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Pages',
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[0],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.content_analytics?.word_count_distribution]);

  const responseTimeChart = useMemo(() => {
    const dist = data?.response_time_stats?.distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = RT_BUCKET_ORDER.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    const aria = `Response time buckets: ${labels.map((l, i) => `${values[i]} URLs ${l}`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'URLs',
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[5],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.response_time_stats?.distribution]);

  const depthChart = useMemo(() => {
    const by = data?.depth_distribution?.by_depth;
    if (!by || typeof by !== 'object') return null;
    const entries = Object.entries(by)
      .map(([k, v]) => [Number(k), Number(v)])
      .filter(([k]) => !Number.isNaN(k))
      .sort((a, b) => a[0] - b[0]);
    if (!entries.length) return null;
    const labels = entries.map(([k]) => `Depth ${k}`);
    const values = entries.map(([, v]) => v);
    const aria = `URLs by crawl depth from start URL: ${entries.map(([d, n]) => `${n} at depth ${d}`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'URLs',
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[4],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.depth_distribution?.by_depth]);

  const titleMetaChart = useMemo(() => {
    const seo = data?.seo_health || {};
    const hasTitle =
      seo.missing_title != null ||
      seo.title_short != null ||
      seo.title_long != null ||
      seo.title_ok != null;
    const hasMeta =
      seo.missing_meta_desc != null ||
      seo.meta_desc_short != null ||
      seo.meta_desc_long != null ||
      seo.meta_desc_ok != null;
    if (!hasTitle && !hasMeta) return null;
    const labels = ['Missing', 'Too short', 'Too long', 'In range'];
    const titleData = hasTitle
      ? [
          Number(seo.missing_title || 0),
          Number(seo.title_short || 0),
          Number(seo.title_long || 0),
          Number(seo.title_ok || 0),
        ]
      : null;
    const metaData = hasMeta
      ? [
          Number(seo.missing_meta_desc || 0),
          Number(seo.meta_desc_short || 0),
          Number(seo.meta_desc_long || 0),
          Number(seo.meta_desc_ok || 0),
        ]
      : null;
    const datasets = [];
    if (titleData) {
      datasets.push({
        label: 'Title tags',
        data: titleData,
        backgroundColor: PALETTE_CATEGORICAL[0],
        borderRadius: 4,
      });
    }
    if (metaData) {
      datasets.push({
        label: 'Meta descriptions',
        data: metaData,
        backgroundColor: PALETTE_CATEGORICAL[1],
        borderRadius: 4,
      });
    }
    const total = [...(titleData || []), ...(metaData || [])].reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return {
      data: { labels, datasets },
      aria: 'Grouped comparison of title tag and meta description length health across all crawled pages.',
    };
  }, [data?.seo_health]);

  const socialChart = useMemo(() => {
    const social = data?.social_coverage || {};
    const og = social.og_coverage_pct;
    const tw = social.twitter_coverage_pct;
    const img = social.og_image_coverage_pct;
    if (og == null && tw == null && img == null) return null;
    const labels = [];
    const values = [];
    if (og != null) {
      labels.push('og:title');
      values.push(Number(og));
    }
    if (tw != null) {
      labels.push('Twitter card');
      values.push(Number(tw));
    }
    if (img != null) {
      labels.push('og:image');
      values.push(Number(img));
    }
    if (!labels.length) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Coverage',
            data: values,
            backgroundColor: [PALETTE_CATEGORICAL[0], PALETTE_CATEGORICAL[2], PALETTE_CATEGORICAL[3]],
            borderRadius: 4,
          },
        ],
      },
      aria: `Social preview coverage on HTML pages: ${labels.map((l, i) => `${l} ${values[i]}%`).join(', ')}.`,
    };
  }, [data?.social_coverage]);

  const readingLevelChart = useMemo(() => {
    const dist = data?.content_analytics?.reading_level_distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = RL_BUCKET_ORDER.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Pages',
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[6],
            borderRadius: 4,
          },
        ],
      },
      aria: `Reading level (estimated) on 2xx pages: ${labels.map((l, i) => `${values[i]} ${l}`).join(', ')}.`,
    };
  }, [data?.content_analytics?.reading_level_distribution]);

  const mimeChart = useMemo(() => {
    let labels = data?.mime_labels || [];
    let values = (data?.mime_values || []).map(Number);
    if (!labels.length) return null;
    const sorted = sortByValue(labels, values, 'desc');
    labels = sorted.labels.slice(0, 8);
    values = sorted.values.slice(0, 8);
    if (!values.some((v) => v > 0)) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'URLs',
            data: values,
            backgroundColor: palette(labels.length),
            borderRadius: 4,
          },
        ],
      },
      aria: `Top content types: ${labels.map((l, i) => `${values[i]} ${l}`).join(', ')}.`,
    };
  }, [data?.mime_labels, data?.mime_values]);

  const lighthouseChart = useMemo(() => {
    const cs = data?.lighthouse_summary?.category_scores;
    if (!cs || typeof cs !== 'object') return null;
    const labels = [];
    const values = [];
    const colors = [];
    LH_CAT_ORDER.forEach((id) => {
      const v = cs[id];
      if (v == null) return;
      labels.push(LH_CAT_LABELS[id] || id);
      values.push(Number(v));
      colors.push(scoreBandColor(Number(v)));
    });
    if (!labels.length) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Lighthouse',
            data: values,
            backgroundColor: colors,
            borderRadius: 4,
          },
        ],
      },
      aria: `Lighthouse category scores (0–100): ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}.`,
    };
  }, [data?.lighthouse_summary?.category_scores]);

  if (!data) return null;

  const s = data.summary || {};
  const siteName = data.site_name || 'Site';
  const h1Zero = (data.seo_health && data.seo_health.h1_zero) || 0;
  const brokenCount = (s.count_4xx || 0) + (s.count_5xx || 0);
  const depth = data.depth_distribution || {};

  const hasInsightCharts =
    wordCountChart ||
    responseTimeChart ||
    depthChart ||
    titleMetaChart ||
    socialChart ||
    readingLevelChart ||
    mimeChart ||
    lighthouseChart;

  return (
    <PageLayout className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            Site health summary for <span className="text-blue-400">{siteName}</span>.{' '}
            {s.crawl_time_s != null ? `Crawl completed in ${s.crawl_time_s}s.` : 'Crawl completed.'}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" /> Total URLs
          </div>
          <div className="text-3xl font-bold text-bright">{(s.total_urls || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-2">{s.avg_outlinks ?? 0} Avg Outlinks / Page</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" /> Success Rate (2xx)
          </div>
          <div className="text-3xl font-bold text-green-400">{s.success_rate ?? 0}%</div>
        </Card>
        <Card shadow className="border-red-900/30 ring-1 ring-red-500/20">
          <div className="text-red-400/80 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Broken (4xx/5xx)
          </div>
          <div className="text-3xl font-bold text-red-500">{brokenCount}</div>
          <div className="text-xs text-slate-400 mt-2">{s.count_4xx ?? 0} 4xx, {s.count_5xx ?? 0} 5xx</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" /> Missing H1s
          </div>
          <div className="text-3xl font-bold text-yellow-500">{h1Zero}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Median Word Count
          </div>
          <div className="text-3xl font-bold text-bright">
            {data.content_analytics?.word_count_stats?.median != null
              ? Math.round(data.content_analytics.word_count_stats.median).toLocaleString()
              : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">per page (2xx HTML)</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Share className="h-4 w-4 text-blue-400" /> OG Tag Coverage
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {data.social_coverage?.og_coverage_pct != null ? `${data.social_coverage.og_coverage_pct}%` : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">pages with og:title</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-400" /> Technologies
          </div>
          <div className="text-3xl font-bold text-purple-400">
            {data.tech_stack_summary?.technologies?.length ?? '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">detected across site</div>
        </Card>
        <Card shadow>
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Timer className="h-4 w-4 text-amber-400" /> Response Time p50
          </div>
          <div className="text-3xl font-bold text-amber-400">
            {data.response_time_stats?.p50 != null ? `${Math.round(data.response_time_stats.p50)}ms` : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            p95: {data.response_time_stats?.p95 != null ? `${Math.round(data.response_time_stats.p95)}ms` : '—'}
          </div>
        </Card>
      </div>

      {hasInsightCharts && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-1 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-slate-400" />
            Insights at a glance
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-3xl">
            Distributions and coverage derived from this crawl: where content sits by length, how fast URLs responded, how deep the crawler reached, on-page metadata health, share-preview tags, and—when a Lighthouse run is attached—category scores.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {wordCountChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Content depth (word count)</h3>
                <p className="text-xs text-slate-500 mb-3">
                  2xx HTML pages by word-count bucket. Heavy left skew often means thin or template-heavy indexable URLs.
                </p>
                <div className="h-56" role="img" aria-label={wordCountChart.aria}>
                  <Bar data={wordCountChart.data} options={barOptsVertical('Pages', wordCountChart.aria)} />
                </div>
              </Card>
            )}
            {responseTimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Server / fetch latency</h3>
                <p className="text-xs text-slate-500 mb-3">
                  All crawled URLs by response time. Tail in slower buckets flags pages to optimize or investigate.
                </p>
                <div className="h-56" role="img" aria-label={responseTimeChart.aria}>
                  <Bar data={responseTimeChart.data} options={barOptsVertical('URLs', responseTimeChart.aria)} />
                </div>
              </Card>
            )}
            {depthChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Crawl depth from start URL</h3>
                <p className="text-xs text-slate-500 mb-3">
                  How discovered URLs spread by hop count. A sharp drop after depth 1–2 is common; spikes at high depth may mean long chains or deep archives.
                </p>
                <div className="text-xs text-slate-500 mb-2 tabular-nums">
                  Max depth {depth.max_depth ?? '—'}, avg {depth.avg_depth ?? '—'}
                </div>
                <div className="h-52" role="img" aria-label={depthChart.aria}>
                  <Bar data={depthChart.data} options={barOptsVertical('URLs', depthChart.aria)} />
                </div>
              </Card>
            )}
            {titleMetaChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Title &amp; meta description health</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Per-page checks across the crawl: missing, length outside recommended ranges, or within target bands (titles ~30–60 chars, descriptions ~70–160).
                </p>
                <div className="h-64" role="img" aria-label={titleMetaChart.aria}>
                  <Bar data={titleMetaChart.data} options={barOptsGrouped('Pages')} />
                </div>
              </Card>
            )}
            {socialChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Social preview coverage</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Share of 2xx HTML pages with Open Graph / Twitter signals. Low og:image hurts link previews on social and chat apps.
                </p>
                <div className="h-44" role="img" aria-label={socialChart.aria}>
                  <Bar data={socialChart.data} options={barOptsSocial()} />
                </div>
              </Card>
            )}
            {readingLevelChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Reading level (estimated)</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Grade-level style buckets on 2xx pages. Use to sanity-check whether copy matches your audience.
                </p>
                <div className="h-56" role="img" aria-label={readingLevelChart.aria}>
                  <Bar data={readingLevelChart.data} options={barOptsVertical('Pages', readingLevelChart.aria)} />
                </div>
              </Card>
            )}
            {mimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Top MIME types</h3>
                <p className="text-xs text-slate-500 mb-3">
                  What the crawler actually fetched. Large non-HTML counts can mean assets, feeds, or mis-linked URLs in scope.
                </p>
                <div className="h-56" role="img" aria-label={mimeChart.aria}>
                  <Bar data={mimeChart.data} options={barOptsVertical('URLs', mimeChart.aria)} />
                </div>
              </Card>
            )}
            {lighthouseChart && (
              <Card shadow className="lg:col-span-2">
                <h3 className="text-sm font-bold text-slate-200 mb-1">Lighthouse category scores</h3>
                <p className="text-xs text-slate-500 mb-3">
                  From the attached Lighthouse summary (typically the audited landing or representative URL). Scores are 0–100; bars use the same good / needs work / poor coloring as elsewhere.
                </p>
                <div className="h-48 max-w-2xl" role="img" aria-label={lighthouseChart.aria}>
                  <Bar data={lighthouseChart.data} options={barOptsLighthouse()} />
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold text-bright mb-4">Health by Category</h2>
        {data.categories && data.categories.length > 0 ? (
          categoriesFiltered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {categoriesFiltered.map((cat, i) => {
              const score = cat.score != null ? Math.min(100, Math.max(0, cat.score)) : 0;
              const label = score >= 80 ? 'Good' : score >= 50 ? 'Needs Improvement' : 'Critical';
              const labelCls = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-500';
              const color = scoreBandColor(cat.score);
              const isCritical = score < 50;
              return (
                <Card key={i} className="flex items-center gap-6">
                  <div className="w-20 h-20 relative shrink-0" aria-label={`${cat.name || cat.id}: ${label}, score ${cat.score != null ? cat.score : 'N/A'}`}>
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#1F2937"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={color}
                        strokeWidth="3"
                        strokeDasharray={`${score}, 100`}
                        strokeLinecap="round"
                      />
                      {isCritical && (
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={color}
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                          opacity="0.8"
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-bright">
                      {cat.score != null ? cat.score : 'N/A'}
                    </div>
                  </div>
                  <div className="min-w-0 break-words pr-1">
                    <h3 className="text-lg font-bold text-slate-200">{cat.name || cat.id || ''}</h3>
                    <p className={`text-sm mt-1 ${labelCls}`}>{label}</p>
                  </div>
                </Card>
              );
            })}
          </div>
          ) : (
            <p className="text-slate-500 mb-8">No categories match your search.</p>
          )
        ) : (
          <p className="text-slate-500">No category data.</p>
        )}
      </div>

      {(data.status_counts && Object.keys(data.status_counts).length > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-3">Status breakdown</h2>
          <Card padding="tight" className="max-w-md">
            {(() => {
              const labels = Object.keys(data.status_counts);
              const values = Object.values(data.status_counts).map(Number);
              const { labels: sortedLabels, values: sortedValues } = sortByValue(labels, values, 'desc');
              return (
                <div className="h-40" role="img" aria-label={`Status: ${sortedLabels.map((l, i) => `${sortedValues[i]} ${l}`).join(', ')}`}>
                  <Bar
                    data={{
                      labels: sortedLabels,
                      datasets: [{ data: sortedValues, backgroundColor: palette(sortedLabels.length), label: 'URLs' }],
                    }}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { color: 'rgba(71, 85, 105, 0.5)' }, beginAtZero: true },
                        y: { grid: { color: 'rgba(71, 85, 105, 0.5)' } },
                      },
                    }}
                  />
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {data.site_level && (data.site_level.robots_present != null || data.site_level.sitemap_present != null) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-3">Site Configuration</h2>
          <Card padding="tight" className="flex gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">robots.txt:</span>
              <span className="font-semibold text-slate-200">{data.site_level.robots_present ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">sitemap.xml:</span>
              <span className="font-semibold text-slate-200">
                {data.site_level.sitemap_present ? 'Yes' : 'No'}
                {data.site_level.sitemap_valid === true ? ' (valid)' : data.site_level.sitemap_present ? ' (invalid or unparsed)' : ''}
              </span>
            </div>
          </Card>
        </div>
      )}

      {(data.recommendations || []).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" /> Recommendations
          </h2>
          {recommendationsFiltered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendationsFiltered.map((r, i) => {
              const c = REC_COLORS[i % REC_COLORS.length];
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 border-l-4 ${c.border} ${c.bg} rounded-r-xl px-4 py-3`}
                >
                  <ChevronRight className={`h-4 w-4 shrink-0 mt-0.5 ${c.text}`} />
                  <span className="text-sm text-slate-200 leading-relaxed">{r}</span>
                </div>
              );
            })}
          </div>
          ) : (
            <p className="text-slate-500 text-sm">No recommendations match your search.</p>
          )}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-400" /> Top Pages by Importance
        </h2>
        {(data.top_pages || []).length > 0 ? (() => {
          const pages = topPagesFiltered;
          if (pages.length === 0) {
            return <p className="text-slate-500">No top pages match your search.</p>;
          }
          const maxPR = Math.max(...pages.map((p) => p.pagerank != null ? Number(p.pagerank) : 0), 0.0001);
          const maxDeg = Math.max(...pages.map((p) => p.degree ?? p.outlinks ?? 0), 1);
          return (
            <Card overflowHidden padding="none">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeadCell className="text-center w-10">#</TableHeadCell>
                    <TableHeadCell className="text-left">Page Title</TableHeadCell>
                    <TableHeadCell className="text-left">URL</TableHeadCell>
                    <TableHeadCell className="text-right">PageRank</TableHeadCell>
                    <TableHeadCell className="text-right">Inbound Links</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {pages.map((p, i) => {
                    const pr = p.pagerank != null ? Number(p.pagerank) : null;
                    const deg = p.degree ?? p.outlinks ?? null;
                    const prPct = pr != null ? (pr / maxPR) * 100 : 0;
                    const degPct = deg != null ? (deg / maxDeg) * 100 : 0;
                    const rankColor = i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-slate-500';
                    return (
                      <TableRow key={i}>
                        <TableCell className={`text-center font-bold text-sm ${rankColor}`}>{i + 1}</TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="text-slate-200 font-medium text-sm truncate" title={p.title || p.url}>
                            {p.title || <span className="text-slate-500 italic">No title</span>}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 font-mono text-blue-400 text-xs hover:text-blue-300 hover:underline group truncate"
                            title={p.url}
                          >
                            <span className="truncate">{p.url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-track rounded-full h-1.5 hidden sm:block">
                              <div
                                className="h-1.5 rounded-full bg-blue-500 transition-all"
                                style={{ width: `${prPct}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-slate-300 tabular-nums">
                              {pr != null ? pr.toFixed(5) : '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-track rounded-full h-1.5 hidden sm:block">
                              <div
                                className="h-1.5 rounded-full bg-purple-500 transition-all"
                                style={{ width: `${degPct}%` }}
                              />
                            </div>
                            <span className="flex items-center gap-1 font-mono text-xs text-slate-300 tabular-nums">
                              <Link2 className="h-3 w-3 text-slate-500 hidden sm:block" />
                              {deg ?? '—'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          );
        })() : (
          <p className="text-slate-500">No top pages data (crawl had no edges or outlinks).</p>
        )}
      </div>

    </PageLayout>
  );
}
