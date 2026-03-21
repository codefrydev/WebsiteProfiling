import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  Globe,
  CheckCircle,
  AlertTriangle,
  FileCode,
  BookOpen,
  Share,
  Cpu,
  Timer,
  ExternalLink,
  TrendingUp,
  Link2,
  Medal,
  ChevronRight,
  ChevronDown,
  Lightbulb,
  BarChart3,
  Sparkles,
  ArrowLeftRight,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { palette, scoreBandColor, sortByValue, PALETTE_CATEGORICAL } from '../utils/chartPalette';
import { formatPageHrefLines } from '../utils/linkUtils';
import { getGridColor, getChartTitleColor } from '../utils/chartJsDefaults';

const REC_COLORS = [
  { border: 'border-l-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-500'   },
  { border: 'border-l-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  dot: 'bg-amber-500'  },
  { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-500' },
  { border: 'border-l-green-500',  bg: 'bg-green-500/10',  text: 'text-green-400',  dot: 'bg-green-500'  },
  { border: 'border-l-rose-500',   bg: 'bg-rose-500/10',   text: 'text-rose-400',   dot: 'bg-rose-500'   },
  { border: 'border-l-cyan-500',   bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   dot: 'bg-cyan-500'   },
];

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const LH_CAT_ORDER = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];

if (typeof ChartJS.defaults?.font !== 'undefined') {
  ChartJS.defaults.font.size = 11;
  ChartJS.defaults.color = 'rgb(203, 213, 225)';
}

function barOptsVertical(yTitle, ariaDescription) {
  const o = strings.views.overview;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${format(o.tooltipCountBar, { count: Number(ctx.raw).toLocaleString() })}` } },
    },
    scales: {
      x: { grid: { color: getGridColor() } },
      y: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        title: { display: true, text: yTitle, color: getChartTitleColor() },
      },
    },
    ...(ariaDescription ? { aria: { description: ariaDescription } } : {}),
  };
}

function barOptsGrouped(yTitle) {
  const o = strings.views.overview;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(o.tooltipGroupedBar, { dataset: ctx.dataset.label, count: Number(ctx.raw).toLocaleString() })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() } },
      y: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        title: { display: true, text: yTitle, color: getChartTitleColor() },
      },
    },
  };
}

function barOptsSocial() {
  const o = strings.views.overview;
  const pct = strings.common.percentOfPages;
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(o.socialTooltipHtml, { label: ctx.label, pct: Number(ctx.raw).toFixed(1) })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: pct, color: getChartTitleColor() },
      },
      y: { grid: { color: getGridColor() } },
    },
  };
}

function barOptsLighthouse() {
  const o = strings.views.overview;
  const scoreLbl = strings.common.score;
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
            return v == null ? ` ${o.lhTooltipNoScore}` : ` ${format(o.lhTooltipScore, { score: Number(v) })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: scoreLbl, color: getChartTitleColor() },
      },
      y: { grid: { color: getGridColor() } },
    },
  };
}

function sumObject(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce((a, v) => a + Number(v || 0), 0);
}

export default function Overview({ searchQuery = '' }) {
  const { data, reportDiff } = useReport();
  const [mlErrOpen, setMlErrOpen] = useState(false);
  const [anomOpen, setAnomOpen] = useState(false);
  const vo = strings.views.overview;
  const sj = strings.common;
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
    const labels = vo.wcBuckets.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    const aria = `${vo.ariaWordCountIntro} ${labels.map((l, i) => `${values[i]} in ${l} words`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartPages,
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[0],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.content_analytics?.word_count_distribution, vo]);

  const responseTimeChart = useMemo(() => {
    const dist = data?.response_time_stats?.distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = vo.rtBuckets.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    const aria = `${vo.ariaResponseTimeIntro} ${labels.map((l, i) => `${values[i]} URLs ${l}`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartUrls,
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[5],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.response_time_stats?.distribution, vo]);

  const depthChart = useMemo(() => {
    const by = data?.depth_distribution?.by_depth;
    if (!by || typeof by !== 'object') return null;
    const entries = Object.entries(by)
      .map(([k, v]) => [Number(k), Number(v)])
      .filter(([k]) => !Number.isNaN(k))
      .sort((a, b) => a[0] - b[0]);
    if (!entries.length) return null;
    const labels = entries.map(([k]) => format(vo.depthLabel, { n: k }));
    const values = entries.map(([, v]) => v);
    const aria = `${vo.ariaDepthIntro} ${entries.map(([d, n]) => `${n} at depth ${d}`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartUrls,
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[4],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.depth_distribution?.by_depth, vo]);

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
    const labels = [...vo.titleMetaLabels];
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
        label: vo.chartTitleTags,
        data: titleData,
        backgroundColor: PALETTE_CATEGORICAL[0],
        borderRadius: 4,
      });
    }
    if (metaData) {
      datasets.push({
        label: vo.chartMetaDesc,
        data: metaData,
        backgroundColor: PALETTE_CATEGORICAL[1],
        borderRadius: 4,
      });
    }
    const total = [...(titleData || []), ...(metaData || [])].reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return {
      data: { labels, datasets },
      aria: vo.groupedTitleMetaAria,
    };
  }, [data?.seo_health, vo]);

  const socialChart = useMemo(() => {
    const social = data?.social_coverage || {};
    const og = social.og_coverage_pct;
    const tw = social.twitter_coverage_pct;
    const img = social.og_image_coverage_pct;
    if (og == null && tw == null && img == null) return null;
    const labels = [];
    const values = [];
    if (og != null) {
      labels.push(vo.socialLabelsOg);
      values.push(Number(og));
    }
    if (tw != null) {
      labels.push(vo.socialLabelsTwitter);
      values.push(Number(tw));
    }
    if (img != null) {
      labels.push(vo.socialLabelsOgImage);
      values.push(Number(img));
    }
    if (!labels.length) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartCoverage,
            data: values,
            backgroundColor: [PALETTE_CATEGORICAL[0], PALETTE_CATEGORICAL[2], PALETTE_CATEGORICAL[3]],
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaSocialIntro} ${labels.map((l, i) => `${l} ${values[i]}%`).join(', ')}.`,
    };
  }, [data?.social_coverage, vo]);

  const readingLevelChart = useMemo(() => {
    const dist = data?.content_analytics?.reading_level_distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = vo.rlBuckets.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartPages,
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[6],
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaReadingIntro} ${labels.map((l, i) => `${values[i]} ${l}`).join(', ')}.`,
    };
  }, [data?.content_analytics?.reading_level_distribution, vo]);

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
            label: vo.chartUrls,
            data: values,
            backgroundColor: palette(labels.length),
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaMimeIntro} ${labels.map((l, i) => `${values[i]} ${l}`).join(', ')}.`,
    };
  }, [data?.mime_labels, data?.mime_values, vo]);

  const lighthouseChart = useMemo(() => {
    const cs = data?.lighthouse_summary?.category_scores;
    if (!cs || typeof cs !== 'object') return null;
    const labels = [];
    const values = [];
    const colors = [];
    LH_CAT_ORDER.forEach((id) => {
      const v = cs[id];
      if (v == null) return;
      labels.push(vo.lighthouseCategoryLabels[id] || id);
      values.push(Number(v));
      colors.push(scoreBandColor(Number(v)));
    });
    if (!labels.length) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartLighthouse,
            data: values,
            backgroundColor: colors,
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaLighthouseIntro} ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}.`,
    };
  }, [data?.lighthouse_summary?.category_scores, vo]);

  if (!data) return null;

  const s = data.summary || {};
  const siteName = data.site_name || strings.app.defaultSiteName;
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
      {data.ml_errors?.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-100/60 dark:bg-amber-950/25 px-4 py-3">
          <button
            type="button"
            onClick={() => setMlErrOpen((o) => !o)}
            className="w-full flex items-center gap-2 text-left text-sm font-semibold text-amber-900 hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
          >
            {mlErrOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            {format(vo.mlErrors, { count: data.ml_errors.length, plural: data.ml_errors.length !== 1 ? 's' : '' })}
          </button>
          {mlErrOpen && (
            <ul className="mt-2 space-y-1 text-xs font-mono text-amber-900/90 dark:text-amber-100/90 list-disc pl-5 max-h-48 overflow-y-auto">
              {data.ml_errors.map((err, i) => (
                <li key={i}>{String(err)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <PageHeader
        title={vo.dashboard}
        subtitle={
          <>
            {vo.subtitleSiteHealth} <span className="text-blue-700 dark:text-blue-400">{siteName}</span>.{' '}
            {s.crawl_time_s != null ? format(vo.crawlDoneSeconds, { seconds: s.crawl_time_s }) : vo.crawlDone}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" /> {vo.totalUrls}
          </div>
          <div className="text-3xl font-bold text-bright">{(s.total_urls || 0).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-2">{s.avg_outlinks ?? 0} {vo.avgOutlinks}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" /> {vo.successRate}
          </div>
          <div className="text-3xl font-bold text-green-400">{s.success_rate ?? 0}%</div>
        </Card>
        <Card shadow className="border-red-900/30 ring-1 ring-red-500/20">
          <div className="text-red-400/80 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {vo.broken}
          </div>
          <div className="text-3xl font-bold text-red-500">{brokenCount}</div>
          <div className="text-xs text-muted-foreground mt-2">{format(vo.count4xx5xx, { count4xx: s.count_4xx ?? 0, count5xx: s.count_5xx ?? 0 })}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" /> {vo.missingH1s}
          </div>
          <div className="text-3xl font-bold text-yellow-500">{h1Zero}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {vo.medianWordCount}
          </div>
          <div className="text-3xl font-bold text-bright">
            {data.content_analytics?.word_count_stats?.median != null
              ? Math.round(data.content_analytics.word_count_stats.median).toLocaleString()
              : sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{vo.perPage2xx}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Share className="h-4 w-4 text-blue-400" /> {vo.ogCoverage}
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {data.social_coverage?.og_coverage_pct != null ? `${data.social_coverage.og_coverage_pct}%` : sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{vo.ogPagesWith}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-400" /> {vo.technologies}
          </div>
          <div className="text-3xl font-bold text-purple-400">
            {data.tech_stack_summary?.technologies?.length ?? sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{vo.techDetectedAcross}</div>
        </Card>
        <Card shadow>
          <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <Timer className="h-4 w-4 text-amber-400" /> {vo.responseP50}
          </div>
          <div className="text-3xl font-bold text-amber-400">
            {data.response_time_stats?.p50 != null ? `${Math.round(data.response_time_stats.p50)}ms` : sj.emDash}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {vo.p95Label} {data.response_time_stats?.p95 != null ? `${Math.round(data.response_time_stats.p95)}ms` : sj.emDash}
          </div>
        </Card>
      </div>

      {reportDiff && (
        <Card shadow className="mb-8 border border-cyan-600/35 dark:border-cyan-900/40 bg-cyan-100/45 dark:bg-cyan-950/10">
          <div className="flex items-center gap-2 mb-2">
            <ArrowLeftRight className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
            <h2 className="text-lg font-bold text-bright">{vo.reportComparison}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4 max-w-3xl">
            {vo.reportComparisonHint}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-brand-900 rounded-lg p-3 border border-default">
              <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.newUrls}</div>
              <div className="text-2xl font-bold text-emerald-400">{reportDiff.newUrls.length}</div>
            </div>
            <div className="bg-brand-900 rounded-lg p-3 border border-default">
              <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.removedUrls}</div>
              <div className="text-2xl font-bold text-rose-400">{reportDiff.removedUrls.length}</div>
            </div>
            <div className="bg-brand-900 rounded-lg p-3 border border-default">
              <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.contentChanged}</div>
              <div className="text-2xl font-bold text-amber-400">{reportDiff.contentChanged.length}</div>
            </div>
            <div className="bg-brand-900 rounded-lg p-3 border border-default">
              <div className="text-muted-foreground text-xs uppercase tracking-wider">{vo.structureChanged}</div>
              <div className="text-2xl font-bold text-foreground">{reportDiff.structureChanged.length}</div>
            </div>
          </div>
          {(reportDiff.newUrls.length > 0 || reportDiff.removedUrls.length > 0 || reportDiff.contentChanged.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
              {reportDiff.newUrls.length > 0 && (
                <div>
                  <div className="text-muted-foreground font-semibold mb-1">{vo.sampleNew}</div>
                  <ul className="space-y-1 font-mono text-muted-foreground max-h-32 overflow-y-auto">
                    {reportDiff.newUrls.slice(0, 12).map((u) => (
                      <li key={u} className="truncate" title={u}>
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reportDiff.removedUrls.length > 0 && (
                <div>
                  <div className="text-muted-foreground font-semibold mb-1">{vo.sampleRemoved}</div>
                  <ul className="space-y-1 font-mono text-muted-foreground max-h-32 overflow-y-auto">
                    {reportDiff.removedUrls.slice(0, 12).map((u) => (
                      <li key={u} className="truncate" title={u}>
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reportDiff.contentChanged.length > 0 && (
                <div>
                  <div className="text-muted-foreground font-semibold mb-1">{vo.sampleContentChanged}</div>
                  <ul className="space-y-1 font-mono text-muted-foreground max-h-32 overflow-y-auto">
                    {reportDiff.contentChanged.slice(0, 12).map((u) => (
                      <li key={u} className="truncate" title={u}>
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {(data.keyword_opportunities?.quick_wins?.length > 0 || data.keyword_opportunities?.high_value?.length > 0) && (
        <Card shadow className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-5 w-5 text-yellow-400" />
            <h2 className="text-lg font-bold text-bright">{vo.keywordOpportunities}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4 max-w-3xl">
            {vo.keywordOpportunitiesHint}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{vo.quickWinsEase}</h3>
              <ul className="space-y-2">
                {(data.keyword_opportunities.quick_wins || []).slice(0, 8).map((k, idx) => (
                  <li
                    key={`qw-${k.keyword}-${idx}`}
                    className="flex justify-between gap-2 text-sm bg-brand-900 border border-default rounded-lg px-3 py-2"
                  >
                    <span className="text-foreground font-medium truncate">{k.keyword}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{k.recommended_action || sj.emDash}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{vo.highEmphasis}</h3>
              <ul className="space-y-2">
                {(data.keyword_opportunities.high_value || []).slice(0, 8).map((k, idx) => (
                  <li
                    key={`hv-${k.keyword}-${idx}`}
                    className="flex justify-between gap-2 text-sm bg-brand-900 border border-default rounded-lg px-3 py-2"
                  >
                    <span className="text-foreground font-medium truncate">{k.keyword}</span>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{k.score != null ? Number(k.score).toFixed(3) : sj.emDash}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {(data.content_duplicates?.length > 0 ||
        data.anomalies?.length > 0 ||
        (data.language_summary?.counts && Object.keys(data.language_summary.counts).length > 0) ||
        (data.semantic_keyword_clusters?.length > 0) ||
        (data.ner_site_summary?.label_counts && Object.keys(data.ner_site_summary.label_counts).length > 0)) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            {vo.contentIntelligence}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card shadow>
              <div className="text-violet-400/80 text-xs font-bold uppercase tracking-wider mb-2">{vo.duplicateGroups}</div>
              <div className="text-3xl font-bold text-violet-300">{data.content_duplicates?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-2">{vo.nearDuplicateGroups}</div>
            </Card>
            <Card shadow>
              <div className="text-amber-400/80 text-xs font-bold uppercase tracking-wider mb-2">{vo.anomalies}</div>
              <div className="text-3xl font-bold text-amber-300">{data.anomalies?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-2">{vo.outliers}</div>
            </Card>
            <Card shadow>
              <div className="text-emerald-400/80 text-xs font-bold uppercase tracking-wider mb-2">{vo.parentTopics}</div>
              <div className="text-3xl font-bold text-emerald-300">{data.semantic_keyword_clusters?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-2">{vo.semanticGroups}</div>
            </Card>
            <Card shadow>
              <div className="text-cyan-400/80 text-xs font-bold uppercase tracking-wider mb-2">{vo.namedEntities}</div>
              <div className="text-3xl font-bold text-cyan-300">
                {data.ner_site_summary?.total_entities != null
                  ? data.ner_site_summary.total_entities.toLocaleString()
                  : sj.emDash}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {data.ner_site_summary?.pages_with_ner != null
                  ? format(vo.pagesSampled, { n: data.ner_site_summary.pages_with_ner })
                  : vo.entitiesSitewide}
              </div>
            </Card>
            <Card shadow className="col-span-2 lg:col-span-4">
              <div className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">{vo.languagesSampled}</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.language_summary?.counts || {})
                  .slice(0, 8)
                  .map(([lang, n]) => (
                    <span
                      key={lang}
                      className="text-xs font-mono px-2 py-1 rounded-lg bg-brand-900 border border-default text-foreground"
                    >
                      {lang}: {n}
                    </span>
                  ))}
                {(!data.language_summary?.counts || Object.keys(data.language_summary.counts).length === 0) && (
                  <span className="text-xs text-muted-foreground">{sj.emDash}</span>
                )}
              </div>
              {data.language_summary?.mixed_site && (
                <p className="text-xs text-amber-800 dark:text-yellow-400/80 mt-2">{vo.mixedLanguage}</p>
              )}
            </Card>
          </div>

          {data.anomalies?.length > 0 && (
            <Card shadow className="mt-4">
              <button
                type="button"
                onClick={() => setAnomOpen((o) => !o)}
                className="w-full flex items-center gap-2 text-left text-sm font-bold text-amber-900 dark:text-amber-200/90 mb-2"
              >
                {anomOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {format(vo.anomalyUrlsTitle, { count: data.anomalies.length })}
              </button>
              {anomOpen && (
                <div className="max-h-72 overflow-auto rounded-lg border border-muted">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeadCell>{vo.thUrl}</TableHeadCell>
                        <TableHeadCell>{vo.thScore}</TableHeadCell>
                        <TableHeadCell>{vo.thReasons}</TableHeadCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.anomalies.map((a, idx) => (
                        <TableRow key={`${a.url}-${idx}`}>
                          <TableCell className="font-mono text-xs max-w-[min(100vw,28rem)] break-all">
                            <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-700 dark:text-blue-400 hover:underline">
                              {a.url}
                            </a>
                          </TableCell>
                          <TableCell className="text-xs font-mono tabular-nums">{a.anomaly_score ?? sj.emDash}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {(a.reasons || []).join(', ') || sj.emDash}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {hasInsightCharts && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-1 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            {vo.insightsGlance}
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
            {vo.insightsHint}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {wordCountChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.contentDepth}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.contentDepthHint}
                </p>
                <div className="h-56" role="img" aria-label={wordCountChart.aria}>
                  <Bar data={wordCountChart.data} options={barOptsVertical(vo.chartPages, wordCountChart.aria)} />
                </div>
              </Card>
            )}
            {responseTimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.serverLatency}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.serverLatencyHint}
                </p>
                <div className="h-56" role="img" aria-label={responseTimeChart.aria}>
                  <Bar data={responseTimeChart.data} options={barOptsVertical(vo.chartUrls, responseTimeChart.aria)} />
                </div>
              </Card>
            )}
            {depthChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.crawlDepth}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.crawlDepthHint}
                </p>
                <div className="text-xs text-muted-foreground mb-2 tabular-nums">
                  {format(vo.depthSummaryLine, { maxDepth: depth.max_depth ?? sj.emDash, avgDepth: depth.avg_depth ?? sj.emDash })}
                </div>
                <div className="h-52" role="img" aria-label={depthChart.aria}>
                  <Bar data={depthChart.data} options={barOptsVertical(vo.chartUrls, depthChart.aria)} />
                </div>
              </Card>
            )}
            {titleMetaChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.titleMetaHealth}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.titleMetaHint}
                </p>
                <div className="h-64" role="img" aria-label={titleMetaChart.aria}>
                  <Bar data={titleMetaChart.data} options={barOptsGrouped(vo.chartPages)} />
                </div>
              </Card>
            )}
            {socialChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.socialPreview}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.socialPreviewHint}
                </p>
                <div className="h-44" role="img" aria-label={socialChart.aria}>
                  <Bar data={socialChart.data} options={barOptsSocial()} />
                </div>
              </Card>
            )}
            {readingLevelChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.readingLevel}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.readingLevelHint}
                </p>
                <div className="h-56" role="img" aria-label={readingLevelChart.aria}>
                  <Bar data={readingLevelChart.data} options={barOptsVertical(vo.chartPages, readingLevelChart.aria)} />
                </div>
              </Card>
            )}
            {mimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.topMime}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.topMimeHint}
                </p>
                <div className="h-56" role="img" aria-label={mimeChart.aria}>
                  <Bar data={mimeChart.data} options={barOptsVertical(vo.chartUrls, mimeChart.aria)} />
                </div>
              </Card>
            )}
            {lighthouseChart && (
              <Card shadow className="lg:col-span-2">
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.lhCategoryScores}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {vo.lhCategoryHint}
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
        <h2 className="text-xl font-bold text-bright mb-4">{vo.healthByCategory}</h2>
        {data.categories && data.categories.length > 0 ? (
          categoriesFiltered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {categoriesFiltered.map((cat, i) => {
              const score = cat.score != null ? Math.min(100, Math.max(0, cat.score)) : 0;
              const label = score >= 80 ? vo.scoreGood : score >= 50 ? vo.scoreNeeds : vo.scoreCritical;
              const labelCls = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-500';
              const color = scoreBandColor(cat.score);
              const isCritical = score < 50;
              return (
                <Card key={i} className="flex items-center gap-6">
                  <div className="w-20 h-20 relative shrink-0" aria-label={format(vo.categoryScoreAria, { name: cat.name || cat.id, band: label, score: cat.score != null ? cat.score : sj.na })}>
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
                      {cat.score != null ? cat.score : sj.na}
                    </div>
                  </div>
                  <div className="min-w-0 break-words pr-1">
                    <h3 className="text-lg font-bold text-foreground">{cat.name || cat.id || ''}</h3>
                    <p className={`text-sm mt-1 ${labelCls}`}>{label}</p>
                  </div>
                </Card>
              );
            })}
          </div>
          ) : (
            <p className="text-muted-foreground mb-8">{vo.noCategorySearch}</p>
          )
        ) : (
          <p className="text-muted-foreground">{vo.noCategoryData}</p>
        )}
      </div>

      {(data.status_counts && Object.keys(data.status_counts).length > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-3">{vo.statusBreakdown}</h2>
          <Card padding="tight" className="max-w-md">
            {(() => {
              const labels = Object.keys(data.status_counts);
              const values = Object.values(data.status_counts).map(Number);
              const { labels: sortedLabels, values: sortedValues } = sortByValue(labels, values, 'desc');
              return (
                <div className="h-40" role="img" aria-label={`${vo.statusAriaIntro} ${sortedLabels.map((l, i) => `${sortedValues[i]} ${l}`).join(', ')}`}>
                  <Bar
                    data={{
                      labels: sortedLabels,
                      datasets: [{ data: sortedValues, backgroundColor: palette(sortedLabels.length), label: vo.chartUrls }],
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
          <h2 className="text-xl font-bold text-bright mb-3">{vo.siteConfiguration}</h2>
          <Card padding="tight" className="flex gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{vo.robotsTxt}</span>
              <span className="font-semibold text-foreground">{data.site_level.robots_present ? sj.yes : sj.no}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{vo.sitemapXml}</span>
              <span className="font-semibold text-foreground">
                {data.site_level.sitemap_present ? sj.yes : sj.no}
                {data.site_level.sitemap_valid === true ? vo.sitemapValid : data.site_level.sitemap_present ? vo.sitemapInvalid : ''}
              </span>
            </div>
          </Card>
        </div>
      )}

      {(data.recommendations || []).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-bright mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" /> {vo.recommendations}
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
                  <span className="text-sm text-foreground leading-relaxed">{r}</span>
                </div>
              );
            })}
          </div>
          ) : (
            <p className="text-muted-foreground text-sm">{vo.noRecSearch}</p>
          )}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-bold text-bright mb-2 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-400 shrink-0" /> {vo.topPagesTitle}
        </h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-3xl leading-relaxed">{vo.topPagesHint}</p>
        {(data.top_pages || []).length > 0 ? (() => {
          const pages = topPagesFiltered;
          if (pages.length === 0) {
            return <p className="text-muted-foreground">{vo.noTopSearch}</p>;
          }
          const maxPR = Math.max(...pages.map((p) => p.pagerank != null ? Number(p.pagerank) : 0), 0.0001);
          const maxDeg = Math.max(...pages.map((p) => p.degree ?? p.outlinks ?? 0), 1);
          return (
            <Card overflowHidden padding="none">
              <p className="sm:hidden text-xs text-muted-foreground px-4 py-2 border-b border-muted bg-brand-900/40">{sj.tableSwipeHint}</p>
              <Table className="min-w-[420px]">
                <TableHead sticky>
                  <tr>
                    <TableHeadCell className="text-center sticky left-0 top-0 z-30 w-14 min-w-[3.5rem] bg-brand-900 border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]">
                      {vo.thRank}
                    </TableHeadCell>
                    <TableHeadCell className="text-left sticky left-14 top-0 z-30 min-w-[min(200px,55vw)] max-w-[min(280px,78vw)] bg-brand-900 border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]">
                      {vo.thPage}
                    </TableHeadCell>
                    <TableHeadCell className="text-right min-w-0">{vo.thImportance}</TableHeadCell>
                    <TableHeadCell className="text-right min-w-0">{vo.thConnections}</TableHeadCell>
                  </tr>
                </TableHead>
                <TableBody striped>
                  {pages.map((p, i) => {
                    const pr = p.pagerank != null ? Number(p.pagerank) : null;
                    const deg = p.degree ?? p.outlinks ?? null;
                    const prPct = pr != null ? (pr / maxPR) * 100 : 0;
                    const degPct = deg != null ? (deg / maxDeg) * 100 : 0;
                    const rankMedal =
                      i === 0 ? 'text-amber-400' : i === 1 ? 'text-foreground' : i === 2 ? 'text-orange-400/90' : null;
                    const hrefLines = formatPageHrefLines(p.url);
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-center align-middle sticky left-0 z-20 w-14 min-w-[3.5rem] bg-inherit border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]">
                          <div className="inline-flex items-center justify-center gap-1">
                            {rankMedal != null && (
                              <Medal className={`h-4 w-4 shrink-0 ${rankMedal}`} aria-hidden />
                            )}
                            <span
                              className={`font-semibold tabular-nums ${rankMedal != null ? rankMedal : 'text-muted-foreground'}`}
                            >
                              {i + 1}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-0 sticky left-14 z-20 max-w-[min(280px,78vw)] bg-inherit border-r border-default shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]">
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <div
                              className="text-bright font-medium text-sm leading-snug line-clamp-2"
                              title={typeof p.title === 'string' ? p.title : undefined}
                            >
                              {p.title || <span className="text-muted-foreground italic font-normal">{vo.noTitle}</span>}
                            </div>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-400 group min-w-0"
                              title={p.url}
                            >
                              <span className="truncate font-mono">{hrefLines.label}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </a>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-middle min-w-0">
                          <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                            <div className="order-2 sm:order-1 min-w-0 flex-1 bg-track rounded-full h-2 hidden sm:block">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-all"
                                style={{ width: `${prPct}%` }}
                              />
                            </div>
                            <span
                              className="order-1 sm:order-2 shrink-0 text-sm font-semibold text-foreground tabular-nums"
                              title={
                                pr != null
                                  ? `${vo.thImportance}: ${Math.round(prPct)}% of top page in this table. Raw PageRank ${pr}.`
                                  : undefined
                              }
                            >
                              {pr != null ? `${Math.round(prPct)}%` : sj.emDash}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-middle min-w-0">
                          <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                            <div className="order-2 sm:order-1 min-w-0 flex-1 bg-track rounded-full h-2 hidden sm:block">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-400 transition-all"
                                style={{ width: `${degPct}%` }}
                              />
                            </div>
                            <span className="order-1 sm:order-2 shrink-0 inline-flex items-center gap-1.5 text-sm text-foreground tabular-nums">
                              <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:inline" aria-hidden />
                              {deg ?? sj.emDash}
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
          <p className="text-muted-foreground">{vo.noTopPagesData}</p>
        )}
      </div>

    </PageLayout>
  );
}
