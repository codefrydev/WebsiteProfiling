import { useMemo, useState, createElement } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { BookOpen, BarChart2, FileText, Layers, Share2, Tag } from 'lucide-react';
import { useReport } from '../../../context/useReport';
import { Card } from '../../../components';
import { wcLabel, readingLabel, parseKeywords, normaliseKw } from '../../../utils/linkUtils';
import { palette, PALETTE_CATEGORICAL } from '../../../utils/chartPalette';
import HeadingPills from '../HeadingPills';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

const TITLE_QUAL_LABELS = ['Missing', 'Too Short (<30)', 'Optimal (30–60)', 'Too Long (>60)'];
const META_QUAL_LABELS = ['Missing', 'Too Short (<70)', 'Optimal (70–160)', 'Too Long (>160)'];
const H1_QUAL_LABELS = ['No H1', 'One H1', 'Multiple H1s'];

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

function barOpts(yTitle = 'Pages', xTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw} ${yTitle === 'Words' ? 'words' : 'pages'}` } },
    },
    scales: {
      x: { grid: { color: GRID_COLOR }, ...(xTitle ? { title: { display: true, text: xTitle, color: '#64748b' } } : {}) },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: yTitle, color: '#64748b' } },
    },
  };
}

function barOptsH(tooltipUnit = '') {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw}${tooltipUnit ? ` ${tooltipUnit}` : ''}`,
        },
      },
    },
    scales: {
      x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Count', color: '#64748b' } },
      y: { grid: { color: GRID_COLOR } },
    },
  };
}

function barOptsCompare() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw} words` } },
    },
    scales: {
      x: { grid: { color: GRID_COLOR } },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Words', color: '#64748b' } },
    },
  };
}

function doughnutPageOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12 } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw?.toLocaleString()}` } },
    },
  };
}

function groupedSocialOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw?.toFixed(0)}%` } },
    },
    scales: {
      x: { stacked: true, grid: { color: GRID_COLOR } },
      y: {
        stacked: true,
        grid: { color: GRID_COLOR },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: '%', color: '#64748b' },
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

function wcBucketLabel(wc) {
  const w = Number(wc) || 0;
  if (w <= 100) return '0-100';
  if (w <= 300) return '101-300';
  if (w <= 600) return '301-600';
  if (w <= 1000) return '601-1000';
  if (w <= 2000) return '1001-2000';
  return '2001+';
}

function readingBandLabel(rl) {
  const r = Number(rl) || 0;
  if (r <= 5) return 'Elementary (0-5)';
  if (r <= 8) return 'Middle School (6-8)';
  if (r <= 12) return 'High School (9-12)';
  return 'College (13+)';
}

function contentRatioBandLabel(pct) {
  const p = Number(pct) || 0;
  if (p <= 10) return '<10%';
  if (p <= 20) return '10-20%';
  if (p <= 40) return '20-40%';
  return '>40%';
}

function SectionHeader({ icon, title, description }) {
  return (
    <div className="flex items-start gap-3 border-b border-muted pb-3 mb-1">
      <div className="p-2 bg-brand-800 border border-default rounded-lg shrink-0">
        {createElement(icon, { className: 'h-4 w-4 text-blue-400' })}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-bright">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

export default function ContentTab({ link }) {
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
  const depthLabels = Object.keys(depthByDepth).map((d) => `Depth ${d}`);
  const depthValues = Object.values(depthByDepth).map(Number);
  const hasDepthData = depthLabels.length > 0;

  const titleDoughnut = useMemo(
    () => oneHotDoughnut(TITLE_QUAL_LABELS, titleIdx, qualityBarColors(TITLE_QUAL_LABELS)),
    [titleIdx]
  );
  const metaDoughnut = useMemo(
    () => oneHotDoughnut(META_QUAL_LABELS, metaIdx, qualityBarColors(META_QUAL_LABELS)),
    [metaIdx]
  );
  const h1Doughnut = useMemo(() => {
    if (h1Idx == null) return null;
    return oneHotDoughnut(H1_QUAL_LABELS, h1Idx, ['#EF4444', '#22C55E', '#DD8452']);
  }, [h1Idx]);

  const compareBarData = useMemo(() => {
    const labels = ['This page'];
    const values = [wc];
    const colors = ['#4C72B0'];
    if (meanW != null) {
      labels.push('Site mean');
      values.push(meanW);
      colors.push('#55A868');
    }
    if (medianW != null) {
      labels.push('Site median');
      values.push(medianW);
      colors.push('#DD8452');
    }
    return { labels, values, colors };
  }, [wc, meanW, medianW]);

  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-500 -mt-2">
        Content metrics for this URL, with the same chart styles as Content Insights. Site-wide charts help you see where this page sits in the crawl.
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card shadow className="!p-4">
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Words
          </div>
          <div className={`text-2xl font-bold tabular-nums ${wcInfo.color}`}>{wc.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{wcInfo.label}</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Reading
          </div>
          <div className={`text-2xl font-bold tabular-nums ${rlInfo.color}`}>{rl > 0 ? `Grade ${rl}` : '—'}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{rl > 0 ? rlInfo.label : 'Not enough text'}</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Text / HTML</div>
          <div className="text-2xl font-bold text-bright tabular-nums">{ratioPct.toFixed(1)}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Body text share of HTML</div>
        </Card>
        <Card shadow className="!p-4">
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Depth
          </div>
          <div className="text-2xl font-bold text-bright tabular-nums">{link.depth != null ? link.depth : '—'}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Crawl depth</div>
        </Card>
        <Card shadow className={`!p-4 ${wc < 300 && wc > 0 ? 'ring-1 ring-amber-500/30' : ''}`}>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Thin?</div>
          <div className={`text-2xl font-bold tabular-nums ${wc < 300 ? 'text-amber-400' : 'text-green-400'}`}>
            {wc <= 0 ? '—' : wc < 300 ? 'Yes' : 'No'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">&lt; 300 words</div>
        </Card>
      </div>

      {/* This page vs site */}
      <div className="space-y-4">
        <SectionHeader
          icon={BarChart2}
          title="This page vs site"
          description="Compare word count to crawl-wide mean and median."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Word count comparison</h3>
            <p className="text-xs text-slate-500 mb-2">This page versus site aggregates</p>
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
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
              )}
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Text vs markup (this page)</h3>
            <p className="text-xs text-slate-500 mb-2">Share of visible text in the HTML document</p>
            <div className="h-56">
              <Doughnut
                data={{
                  labels: ['Body text', 'Other (markup, scripts, etc.)'],
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
        <SectionHeader
          icon={BarChart2}
          title="Site distributions"
          description="Same buckets as Content Insights. Caption shows where this page lands."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Word count distribution</h3>
            <p className="text-xs text-slate-500 mb-2">
              This page ({wc.toLocaleString()} words):{' '}
              <span className="text-blue-300 font-semibold">{wcBucketLabel(wc)}</span>
            </p>
            <div className="h-56">
              {wcLabels.length > 0 ? (
                <Bar
                  data={{ labels: wcLabels, datasets: [{ data: wcValues, backgroundColor: palette(wcLabels.length) }] }}
                  options={{ ...barOpts('Pages', 'Bucket'), plugins: { ...barOpts('Pages').plugins, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } } } }}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
              )}
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Reading level distribution</h3>
            <p className="text-xs text-slate-500 mb-2">
              {rl > 0 ? (
                <>
                  This page: <span className="text-blue-300 font-semibold">Grade {rl}</span> →{' '}
                  <span className="text-slate-300">{readingBandLabel(rl)}</span>
                </>
              ) : (
                'Not enough text for a reading level on this page.'
              )}
            </p>
            <div className="h-56">
              {rlLabels.length > 0 ? (
                <Bar
                  data={{
                    labels: rlLabels,
                    datasets: [{ data: rlValues, backgroundColor: ['#22C55E', '#4C72B0', '#EAB308', '#EF4444'].slice(0, rlLabels.length) }],
                  }}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} pages` } },
                    },
                    scales: {
                      x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Pages', color: '#64748b' } },
                      y: { grid: { color: GRID_COLOR } },
                    },
                  }}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
              )}
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Content-to-HTML ratio</h3>
            <p className="text-xs text-slate-500 mb-2">
              This page: <span className="text-blue-300 font-semibold">{ratioPct.toFixed(1)}%</span> → bucket{' '}
              <span className="text-slate-300">{contentRatioBandLabel(ratioPct)}</span>
            </p>
            <div className="h-56">
              {crLabels.length > 0 ? (
                <Bar
                  data={{ labels: crLabels, datasets: [{ data: crValues, backgroundColor: palette(crLabels.length) }] }}
                  options={{ ...barOpts('Pages', 'Bucket'), plugins: { ...barOpts('Pages').plugins, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} pages` } } } }}
                  plugins={[barValueLabelsPlugin]}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
              )}
            </div>
          </Card>
          {kwSorted.length > 0 ? (
            <Card padding="tight">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Top keywords (this page)</h3>
              <p className="text-xs text-slate-500 mb-2">Frequency on this URL only</p>
              <div className="h-56">
                <Bar
                  data={{
                    labels: kwSorted.map((k) => k.word),
                    datasets: [{ data: kwSorted.map((k) => Number(k.count) || 0), backgroundColor: PALETTE_CATEGORICAL[0] }],
                  }}
                  options={barOptsH('occurrences')}
                  plugins={[barValueLabelsPlugin]}
                />
              </div>
            </Card>
          ) : (
            <Card padding="tight" className="flex items-center justify-center min-h-[14rem]">
              <p className="text-sm text-slate-500">No keyword data for this page.</p>
            </Card>
          )}
        </div>
      </div>

      {/* On-page SEO (this page) */}
      <div className="space-y-4">
        <SectionHeader
          icon={Tag}
          title="On-page signals (this page)"
          description="Title length, meta description, and H1 count — same categories as Content Insights."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Title tag</h3>
            <p className="text-xs text-slate-500 mb-2">{titleLen} characters</p>
            <div className="h-52">
              <Doughnut data={titleDoughnut} options={doughnutPageOpts()} />
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Meta description</h3>
            <p className="text-xs text-slate-500 mb-2">{metaLen} characters</p>
            <div className="h-52">
              <Doughnut data={metaDoughnut} options={doughnutPageOpts()} />
            </div>
          </Card>
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">H1 count</h3>
            <p className="text-xs text-slate-500 mb-2">{h1c != null && !Number.isNaN(h1c) ? `${h1c} heading(s)` : '—'}</p>
            <div className="h-52">
              {h1Doughnut ? (
                <Doughnut data={h1Doughnut} options={doughnutPageOpts()} />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No H1 data</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Social meta (this page) */}
      <div className="space-y-4">
        <SectionHeader
          icon={Share2}
          title="Social meta (this page)"
          description="Open Graph, Twitter Card, and OG image presence on this URL."
        />
        <Card padding="tight">
          <div className="h-56">
            <Bar
              data={{
                labels: ['Open Graph', 'Twitter Card', 'OG Image'],
                datasets: [
                  { label: 'Present', data: [hasOg ? 100 : 0, hasTw ? 100 : 0, hasOgImg ? 100 : 0], backgroundColor: '#22C55E' },
                  { label: 'Missing', data: [hasOg ? 0 : 100, hasTw ? 0 : 100, hasOgImg ? 0 : 100], backgroundColor: '#EF444466' },
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
          <SectionHeader
            icon={Layers}
            title="Site architecture context"
            description="Crawl depth across the site. This page is at the depth shown in the KPI row above."
          />
          <Card padding="tight">
            <h3 className="text-sm font-bold text-slate-200 mb-1">Crawl depth distribution</h3>
            {link.depth != null && (
              <p className="text-xs text-slate-500 mb-2">
                This page: <span className="text-blue-300 font-semibold">Depth {link.depth}</span>
              </p>
            )}
            <div className="h-56">
              <Bar
                data={{
                  labels: depthLabels,
                  datasets: [{ data: depthValues, backgroundColor: palette(depthLabels.length) }],
                }}
                options={{
                  ...barOpts('Pages', 'Depth'),
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString()} pages` } },
                  },
                }}
                plugins={[barValueLabelsPlugin]}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Heading sequence + keyword pills (detail) */}
      {link.heading_sequence && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-3">Heading structure</div>
          <HeadingPills sequence={link.heading_sequence} />
        </div>
      )}

      {keywords.length > 0 && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-3">Keywords (quick view)</div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, i) => {
              const { word, count } = normaliseKw(kw);
              return (
                <div key={i} className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setKwHover(i)}
                    onMouseLeave={() => setKwHover(null)}
                    className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-1 rounded-full font-mono hover:bg-blue-500/20 transition-colors"
                  >
                    {word}
                  </button>
                  {kwHover === i && count != null && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 border border-default text-xs text-slate-300 px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                      {count} occurrences
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
