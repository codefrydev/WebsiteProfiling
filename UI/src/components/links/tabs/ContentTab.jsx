import { useMemo, useState, createElement } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { BookOpen, BarChart2, FileText, Layers, Share2, Tag } from 'lucide-react';
import { useReport } from '../../../context/useReport';
import { Card } from '../../../components';
import { wcLabel, readingLabel, parseKeywords, normaliseKw } from '../../../utils/linkUtils';
import { palette, PALETTE_CATEGORICAL } from '../../../utils/chartPalette';
import HeadingPills from '../HeadingPills';
import { strings, format } from '../../../lib/strings';
import { getGridColor, getChartTitleColor, getChartCanvasTextColor } from '../../../utils/chartJsDefaults';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const barValueLabelsPlugin = {
  id: 'contentTabBarLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;
    const dataset = chart.data.datasets?.[0];
    if (!dataset?.data) return;
    const isHorizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = getChartCanvasTextColor();
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

function barOpts(yTitle, xTitle, tooltipUnit) {
  const lc = strings.components.linkTabs.content;
  const vca = strings.views.contentAnalytics;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ` ${
              tooltipUnit === 'words'
                ? format(lc.tooltipWords, { n: ctx.raw?.toLocaleString() ?? ctx.raw })
                : format(vca.chartTooltipCount, { n: ctx.raw?.toLocaleString() ?? ctx.raw })
            }`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() }, ...(xTitle ? { title: { display: true, text: xTitle, color: getChartTitleColor() } } : {}) },
      y: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: yTitle, color: getChartTitleColor() } },
    },
  };
}

function barOptsH(suffixLabel) {
  const sj = strings.common;
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ` ${ctx.raw?.toLocaleString() ?? ctx.raw}${suffixLabel ? ` ${suffixLabel}` : ''}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: sj.count, color: getChartTitleColor() } },
      y: { grid: { color: getGridColor() } },
    },
  };
}

function barOptsReadingDist() {
  const vca = strings.views.contentAnalytics;
  return {
    indexAxis: 'y',
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
      x: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: vca.thPages, color: getChartTitleColor() } },
      y: { grid: { color: getGridColor() } },
    },
  };
}

function barOptsCompare() {
  const lc = strings.components.linkTabs.content;
  const ch = strings.charts;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(lc.tooltipWords, { n: ctx.raw?.toLocaleString() ?? ctx.raw })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() } },
      y: { grid: { color: getGridColor() }, beginAtZero: true, title: { display: true, text: ch.words, color: getChartTitleColor() } },
    },
  };
}

function doughnutPageOpts() {
  const lc = strings.components.linkTabs.content;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(lc.tooltipDoughnut, { label: ctx.label, n: ctx.raw?.toLocaleString() })}`,
        },
      },
    },
  };
}

function groupedSocialOpts() {
  const lc = strings.components.linkTabs.content;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${format(lc.tooltipGroupedPct, { dataset: ctx.dataset.label, pct: ctx.raw?.toFixed(0) })}`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { color: getGridColor() } },
      y: {
        stacked: true,
        grid: { color: getGridColor() },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: lc.axisPercent, color: getChartTitleColor() },
      },
    },
  };
}

function qualityBarColors(labels) {
  return labels.map((l) => {
    const s = l.toLowerCase();
    if (s.includes('missing') || s.includes('no h1')) return '#EF4444';
    if (s.includes('short') || s.includes('long')) return '#EAB308';
    if (s.includes('optimal') || s.includes('one h1')) return '#22C55E';
    if (s.includes('multiple')) return '#DD8452';
    return '#4C72B0';
  });
}

function titleQualityIndex(len) {
  const n = Number(len) || 0;
  if (n === 0) return 0;
  if (n < 30) return 1;
  if (n <= 60) return 2;
  return 3;
}

function metaQualityIndex(len) {
  const n = Number(len) || 0;
  if (n === 0) return 0;
  if (n < 70) return 1;
  if (n <= 160) return 2;
  return 3;
}

function h1QualityIndex(count) {
  const c = Number(count);
  if (c === 0 || Number.isNaN(c)) return 0;
  if (c === 1) return 1;
  return 2;
}

function oneHotDoughnut(labels, index, colors) {
  const data = labels.map((_, i) => (i === index ? 1 : 0));
  const backgroundColor = labels.map((_, i) => (i === index ? colors[i] : `${colors[i]}33`));
  return { labels, datasets: [{ data, backgroundColor, borderColor: 'rgba(15,23,42,0.8)', borderWidth: 2 }] };
}

function wcBucketLabel(wc, buckets) {
  const w = Number(wc) || 0;
  const b = buckets;
  if (!b?.length) return '';
  if (w <= 100) return b[0];
  if (w <= 300) return b[1];
  if (w <= 600) return b[2];
  if (w <= 1000) return b[3];
  if (w <= 2000) return b[4];
  return b[5];
}

function readingBandLabel(rl, bands) {
  const r = Number(rl) || 0;
  const b = bands;
  if (!b?.length) return '';
  if (r <= 5) return b[0];
  if (r <= 8) return b[1];
  if (r <= 12) return b[2];
  return b[3];
}

function contentRatioBandLabel(pct, lc) {
  const p = Number(pct) || 0;
  if (p <= 10) return lc.ratioLt10;
  if (p <= 20) return lc.ratio1020;
  if (p <= 40) return lc.ratio2040;
  return lc.ratioGt40;
}

function SectionHeader({ icon, title, description }) {
  return (
    <div className="flex items-start gap-3 border-b border-muted pb-3 mb-1">
      <div className="p-2 bg-brand-800 border border-default rounded-lg shrink-0">
        {createElement(icon, { className: 'h-4 w-4 text-link' })}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-bright">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

export default function ContentTab({ link }) {
  const lc = strings.components.linkTabs.content;
  const vca = strings.views.contentAnalytics;
  const vo = strings.views.overview;
  const sj = strings.common;
  const lo = strings.components.linkTabs.overview;
  const { data } = useReport();
  const [kwHover, setKwHover] = useState(null);

  const wc = link.word_count || 0;
  const rl = link.reading_level || 0;
  const rlInfo = readingLabel(rl);
  const wcInfo = wcLabel(wc);
  const keywords = useMemo(() => parseKeywords(link.top_keywords), [link.top_keywords]);
  const ratioPct = Math.min(100, Math.max(0, Number(link.content_html_ratio) || 0));

  const ca = data?.content_analytics || {};
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

  const meanW = wcStats.mean != null ? Math.round(wcStats.mean) : null;
  const medianW = wcStats.median != null ? Math.round(wcStats.median) : null;

  const titleLen = (link.title || '').length;
  const metaLen = link.meta_description_len != null ? Number(link.meta_description_len) : (link.meta_description || '').length;
  const h1c = link.h1_count != null ? Number(link.h1_count) : null;

  const titleIdx = titleQualityIndex(titleLen);
  const metaIdx = metaQualityIndex(metaLen);
  const h1Idx = h1c != null && !Number.isNaN(h1c) ? h1QualityIndex(h1c) : null;

  const kwSorted = useMemo(() => {
    const rows = keywords.map((kw) => normaliseKw(kw)).filter((k) => k.word);
    rows.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    return rows.slice(0, 20);
  }, [keywords]);

  const hasOg = !!(link.og_title && String(link.og_title).trim());
  const hasTw = !!(link.twitter_card && String(link.twitter_card).trim());
  const hasOgImg = !!(link.og_image && String(link.og_image).trim());

  const depthDist = data?.depth_distribution || {};
  const depthByDepth = depthDist.by_depth || {};
  const depthLabels = Object.keys(depthByDepth).map((d) => format(lc.depthLabel, { n: d }));
  const depthValues = Object.values(depthByDepth).map(Number);
  const hasDepthData = depthLabels.length > 0;

  const titleQualLabels = vca.titleQualLabels;
  const metaQualLabels = vca.metaQualLabels;
  const h1QualLabels = vca.h1Labels;

  const titleDoughnut = useMemo(
    () => oneHotDoughnut(titleQualLabels, titleIdx, qualityBarColors(titleQualLabels)),
    [titleIdx, titleQualLabels]
  );
  const metaDoughnut = useMemo(
    () => oneHotDoughnut(metaQualLabels, metaIdx, qualityBarColors(metaQualLabels)),
    [metaIdx, metaQualLabels]
  );
  const h1Doughnut = useMemo(() => {
    if (h1Idx == null) return null;
    return oneHotDoughnut(h1QualLabels, h1Idx, ['#EF4444', '#22C55E', '#DD8452']);
  }, [h1Idx, h1QualLabels]);

  const compareBarData = useMemo(() => {
    const labels = [lc.labelThisPage];
    const values = [wc];
    const colors = ['#4C72B0'];
    if (meanW != null) {
      labels.push(lc.labelSiteMean);
      values.push(meanW);
      colors.push('#55A868');
    }
    if (medianW != null) {
      labels.push(lc.labelSiteMedian);
      values.push(medianW);
      colors.push('#DD8452');
    }
    return { labels, values, colors };
  }, [wc, meanW, medianW, lc.labelThisPage, lc.labelSiteMean, lc.labelSiteMedian]);

  return (
    <div className="space-y-8">
      <p className="text-xs text-muted-foreground -mt-2">{lc.intro}</p>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> {lc.kpiWords}
          </div>
          <div className={`text-2xl font-bold tabular-nums ${wcInfo.color}`}>{wc.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{wcInfo.label}</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {lc.kpiReading}
          </div>
          <div className={`text-2xl font-bold tabular-nums ${rlInfo.color}`}>
            {rl > 0 ? format(lo.readingGrade, { n: rl }) : sj.emDash}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{rl > 0 ? rlInfo.label : lc.notEnoughText}</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">{lc.textHtml}</div>
          <div className="text-2xl font-bold text-bright tabular-nums">{ratioPct.toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{lc.bodyTextShare}</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> {lc.kpiDepth}
          </div>
          <div className="text-2xl font-bold text-bright tabular-nums">{link.depth != null ? link.depth : sj.emDash}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{lc.crawlDepth}</div>
        </Card>
        <Card shadow className={`!p-4 ${wc < 300 && wc > 0 ? 'ring-1 ring-amber-500/30' : ''}`}>
          <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">{lc.thinQ}</div>
          <div className={`text-2xl font-bold tabular-nums ${wc < 300 ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
            {wc <= 0 ? sj.emDash : wc < 300 ? sj.yes : sj.no}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{lc.under300Words}</div>
        </Card>
      </div>

      {/* This page vs site */}
      <div className="space-y-4">
        <SectionHeader icon={BarChart2} title={lc.vsSiteTitle} description={lc.vsSiteDesc} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.wordCountComparison}</h3>
            <p className="text-xs text-muted-foreground mb-2">{lc.vsSiteAggregates}</p>
            <div className="h-56">
              {compareBarData.values.length > 0 ? (
                <Bar
                  data={{
                    labels: compareBarData.labels,
                    datasets: [{ data: compareBarData.values, backgroundColor: compareBarData.colors }],
                  }}
                  options={barOptsCompare()}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.textVsMarkup}</h3>
            <p className="text-xs text-muted-foreground mb-2">{lc.textVsMarkupDesc}</p>
            <div className="h-56">
              <Doughnut
                data={{
                  labels: [lc.doughnutBodyText, lc.doughnutOtherMarkup],
                  datasets: [
                    {
                      data: [ratioPct, Math.max(0, 100 - ratioPct)],
                      backgroundColor: ['#22C55E', '#334155'],
                      borderColor: 'rgba(15,23,42,0.8)',
                      borderWidth: 2,
                    },
                  ],
                }}
                options={doughnutPageOpts()}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Site distributions + where this page falls */}
      <div className="space-y-4">
        <SectionHeader icon={BarChart2} title={lc.siteDistTitle} description={lc.siteDistDesc} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.wordCountDist}</h3>
            <p className="text-xs text-muted-foreground mb-2">
              {format(lc.thisPageWords, { words: wc.toLocaleString() })}{' '}
              <span className="text-link-soft font-semibold">{wcBucketLabel(wc, vo.wcBuckets)}</span>
            </p>
            <div className="h-56">
              {wcLabels.length > 0 ? (
                <Bar
                  data={{ labels: wcLabels, datasets: [{ data: wcValues, backgroundColor: palette(wcLabels.length) }] }}
                  options={barOpts(vca.thPages, lc.axisBucket, 'pages')}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.readingLevelDist}</h3>
            <p className="text-xs text-muted-foreground mb-2">
              {rl > 0 ? (
                <>
                  {lc.thisPageGrade}{' '}
                  <span className="text-link-soft font-semibold">{format(lo.readingGrade, { n: rl })}</span> {lc.gradeArrow}{' '}
                  <span className="text-foreground">{readingBandLabel(rl, vo.rlBuckets)}</span>
                </>
              ) : (
                lc.notEnoughReading
              )}
            </p>
            <div className="h-56">
              {rlLabels.length > 0 ? (
                <Bar
                  data={{
                    labels: rlLabels,
                    datasets: [{ data: rlValues, backgroundColor: ['#22C55E', '#4C72B0', '#EAB308', '#EF4444'].slice(0, rlLabels.length) }],
                  }}
                  options={barOptsReadingDist()}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.contentHtmlRatio}</h3>
            <p className="text-xs text-muted-foreground mb-2">
              {lc.thisPageRatio} <span className="text-link-soft font-semibold">{ratioPct.toFixed(1)}%</span> {lc.ratioArrow}{' '}
              <span className="text-foreground">{contentRatioBandLabel(ratioPct, lc)}</span>
            </p>
            <div className="h-56">
              {crLabels.length > 0 ? (
                <Bar
                  data={{ labels: crLabels, datasets: [{ data: crValues, backgroundColor: palette(crLabels.length) }] }}
                  options={barOpts(vca.thPages, lc.axisBucket, 'pages')}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{sj.noData}</div>
              )}
            </div>
          </Card>
          {kwSorted.length > 0 ? (
            <Card padding="tight">
              <h3 className="text-sm font-bold text-foreground mb-1">{lc.topKeywordsPage}</h3>
              <p className="text-xs text-muted-foreground mb-2">{lc.freqThisUrl}</p>
              <div className="h-56">
                <Bar
                  data={{
                    labels: kwSorted.map((k) => k.word),
                    datasets: [{ data: kwSorted.map((k) => Number(k.count) || 0), backgroundColor: PALETTE_CATEGORICAL[0] }],
                  }}
                  options={barOptsH(lc.horizontalBarSuffix)}
                  plugins={[barValueLabelsPlugin]}
                />
              </div>
            </Card>
          ) : (
            <Card padding="tight" className="flex items-center justify-center min-h-[14rem]">
              <p className="text-sm text-muted-foreground">{lc.noKeywordPage}</p>
            </Card>
          )}
        </div>
      </div>

      {/* On-page SEO (this page) */}
      <div className="space-y-4">
        <SectionHeader icon={Tag} title={lc.onPageSignalsTitle} description={lc.onPageSignalsDesc} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.titleTag}</h3>
            <p className="text-xs text-muted-foreground mb-2">{format(lc.characters, { n: titleLen })}</p>
            <div className="h-52">
              <Doughnut data={titleDoughnut} options={doughnutPageOpts()} />
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.metaDesc}</h3>
            <p className="text-xs text-muted-foreground mb-2">{format(lc.characters, { n: metaLen })}</p>
            <div className="h-52">
              <Doughnut data={metaDoughnut} options={doughnutPageOpts()} />
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.h1Count}</h3>
            <p className="text-xs text-muted-foreground mb-2">
              {h1c != null && !Number.isNaN(h1c) ? format(lc.headingCount, { n: h1c }) : sj.emDash}
            </p>
            <div className="h-52">
              {h1Doughnut ? (
                <Doughnut data={h1Doughnut} options={doughnutPageOpts()} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{lc.noH1Data}</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {link.content_excerpt && String(link.content_excerpt).trim() && (
        <div className="space-y-4">
          <SectionHeader icon={FileText} title={lc.contentExcerpt} description={lc.contentExcerptHint} />
          <Card padding="tight">
            <p className="text-xs text-foreground whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed">
              {String(link.content_excerpt).trim()}
            </p>
          </Card>
        </div>
      )}

      {/* Social meta (this page) */}
      <div className="space-y-4">
        <SectionHeader icon={Share2} title={lc.socialMetaTitle} description={lc.socialMetaDesc} />
        <Card padding="tight">
          <div className="h-56">
            <Bar
              data={{
                labels: [vca.openGraph, vca.twitterCard, vca.ogImage],
                datasets: [
                  {
                    label: lc.datasetPresent,
                    data: [hasOg ? 100 : 0, hasTw ? 100 : 0, hasOgImg ? 100 : 0],
                    backgroundColor: '#22C55E',
                  },
                  {
                    label: lc.datasetMissing,
                    data: [hasOg ? 0 : 100, hasTw ? 0 : 100, hasOgImg ? 0 : 100],
                    backgroundColor: '#EF444466',
                  },
                ],
              }}
              options={groupedSocialOpts()}
            />
          </div>
        </Card>
      </div>

      {/* Crawl depth (site) + heading structure */}
      {hasDepthData && (
        <div className="space-y-4">
          <SectionHeader icon={Layers} title={lc.siteArchTitle} description={lc.siteArchDesc} />
          <Card padding="tight">
            <h3 className="text-sm font-bold text-foreground mb-1">{lc.crawlDepthDist}</h3>
            {link.depth != null && (
              <p className="text-xs text-muted-foreground mb-2">
                {lc.thisPageDepth}{' '}
                <span className="text-link-soft font-semibold">{format(lc.depthLabel, { n: link.depth })}</span>
              </p>
            )}
            <div className="h-56">
              <Bar
                data={{
                  labels: depthLabels,
                  datasets: [{ data: depthValues, backgroundColor: palette(depthLabels.length) }],
                }}
                options={barOpts(vca.thPages, lc.axisDepth, 'pages')}
                plugins={[barValueLabelsPlugin]}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Heading sequence + keyword pills (detail) */}
      {link.heading_sequence && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-3">{lc.headingStructure}</div>
          <HeadingPills sequence={link.heading_sequence} />
        </div>
      )}

      {keywords.length > 0 && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-3">{lc.keywordsQuick}</div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, i) => {
              const { word, count } = normaliseKw(kw);
              return (
                <div key={i} className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setKwHover(i)}
                    onMouseLeave={() => setKwHover(null)}
                    className="text-xs bg-blue-500/10 text-link-soft border border-blue-500/20 px-2.5 py-1 rounded-full font-mono hover:bg-blue-500/20 transition-colors"
                  >
                    {word}
                  </button>
                  {kwHover === i && count != null && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-brand-800 border border-default text-xs text-foreground px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                      {format(lc.occurrences, { n: count })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
