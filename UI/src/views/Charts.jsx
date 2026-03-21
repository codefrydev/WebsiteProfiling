import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Bubble, Scatter } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card } from '../components';
import { palette, sortByValue, PALETTE_CATEGORICAL } from '../utils/chartPalette';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, PointElement, Title, Tooltip, Legend);

// Global chart defaults (typography)
if (typeof ChartJS.defaults?.font !== 'undefined') {
  ChartJS.defaults.font.size = 11;
  ChartJS.defaults.color = 'rgb(203, 213, 225)'; // slate-300
}

const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

/** Plugin: draw value label at end of each bar */
const barValueLabelsPlugin = {
  id: 'barValueLabels',
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
      if (value == null) return;
      const label = Number(value).toLocaleString();
      const x = isHorizontal ? bar.x + (bar.width >= 0 ? 6 : -6) : bar.x;
      const y = isHorizontal ? bar.y : bar.y - (bar.height >= 0 ? 12 : -12);
      ctx.fillText(label, x, y);
    });
    ctx.restore();
  },
};

function barOptsY(ariaSummary) {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw} URLs` } },
    },
    scales: {
      x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Count' } },
      y: { grid: { color: GRID_COLOR } },
    },
    ...(ariaSummary && { aria: { description: ariaSummary } }),
  };
}

function barOpts(ariaSummary) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw} URLs` } },
    },
    scales: {
      x: { grid: { color: GRID_COLOR } },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Count' } },
    },
    ...(ariaSummary && { aria: { description: ariaSummary } }),
  };
}

export default function Charts({ searchQuery = '' }) {
  const { data } = useReport();

  if (!data) return null;

  const q = (searchQuery || '').toLowerCase().trim();
  const totalUrls = (data.summary?.total_urls) ?? 0;

  let statusLabels = Object.keys(data.status_counts || {});
  let statusValues = Object.values(data.status_counts || {}).map(Number);
  const statusSorted = sortByValue(statusLabels, statusValues, 'desc');
  statusLabels = statusSorted.labels;
  statusValues = statusSorted.values;

  let mimeLabels = data.mime_labels || [];
  let mimeValues = (data.mime_values || []).map(Number);
  const mimeSorted = sortByValue(mimeLabels, mimeValues, 'desc');
  mimeLabels = mimeSorted.labels.slice(0, 12);
  mimeValues = mimeSorted.values.slice(0, 12);

  const outlinkLabels = data.outlink_labels || [];
  const outlinkCounts = (data.outlink_counts || []).map(Number);

  const titleLabels = data.title_labels || [];
  const titleCounts = (data.title_counts || []).map(Number);

  let domainLabels = data.domain_labels || [];
  let domainValues = (data.domain_values || []).map(Number);
  const domainSorted = sortByValue(domainLabels, domainValues, 'desc');
  domainLabels = domainSorted.labels.slice(0, 10);
  domainValues = domainSorted.values.slice(0, 10);

  const statusAria = statusLabels.length
    ? `Bar chart: status code distribution. ${statusLabels.map((l, i) => `${statusValues[i]} ${l}`).join(', ')}.`
    : 'No status data';

  return (
    <PageLayout>
      <PageHeader
        title="Crawl Analytics"
        subtitle="Status codes, content types, outlinks, title length, and domain distribution."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">Status code distribution</h3>
          <p className="text-xs text-slate-500 mb-3">Crawl response codes{totalUrls ? ` · ${totalUrls.toLocaleString()} URLs` : ''}</p>
          <div className="h-64" role="img" aria-label={statusAria}>
            {statusLabels.length > 0 ? (
              <Bar
                data={{
                  labels: statusLabels,
                  datasets: [{ data: statusValues, backgroundColor: palette(statusLabels.length) }],
                }}
                options={barOptsY(statusAria)}
                plugins={[barValueLabelsPlugin]}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </Card>
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">Top content-types</h3>
          <p className="text-xs text-slate-500 mb-3">By URL count</p>
          <div className="h-64" role="img" aria-label={mimeLabels.length ? `Bar chart: top content types. ${mimeLabels[0]}: ${mimeValues[0]}.` : 'No data'}>
            {mimeLabels.length > 0 ? (
              <Bar
                data={{
                  labels: mimeLabels,
                  datasets: [{ data: mimeValues, backgroundColor: palette(mimeLabels.length) }],
                }}
                options={barOpts()}
                plugins={[barValueLabelsPlugin]}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </Card>
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">Outlinks per page</h3>
          <p className="text-xs text-slate-500 mb-3">Bucket distribution</p>
          <div className="h-64" role="img" aria-label={outlinkLabels.length ? 'Bar chart: outlinks distribution by bucket.' : 'No data'}>
            {outlinkLabels.length > 0 ? (
              <Bar
                data={{
                  labels: outlinkLabels,
                  datasets: [{ data: outlinkCounts, backgroundColor: palette(1)[0] }],
                }}
                options={barOpts()}
                plugins={[barValueLabelsPlugin]}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </Card>
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">Title length (characters)</h3>
          <p className="text-xs text-slate-500 mb-3">51–100 is ideal for SEO</p>
          <div className="h-64" role="img" aria-label={titleLabels.length ? 'Bar chart: title length distribution by character bucket.' : 'No data'}>
            {titleLabels.length > 0 ? (
              <Bar
                data={{
                  labels: titleLabels,
                  datasets: [{ data: titleCounts, backgroundColor: palette(1)[1] }],
                }}
                options={(() => {
                  const opts = barOpts();
                  return { ...opts, scales: { ...opts.scales, x: { ...opts.scales.x, title: { display: true, text: 'Character count' } } } };
                })()}
                plugins={[barValueLabelsPlugin]}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </Card>
      </div>
      <Card padding="tight" className="print:break-inside-avoid">
        <h3 className="text-sm font-bold text-slate-200 mb-1">Top domains discovered</h3>
        <p className="text-xs text-slate-500 mb-3">By URL count (ranking)</p>
        <div className="h-64" role="img" aria-label={domainLabels.length ? `Bar chart: top domains. ${domainLabels[0]}: ${domainValues[0]}.` : 'No data'}>
          {domainLabels.length > 0 ? (
            <Bar
              data={{
                labels: domainLabels,
                datasets: [{ data: domainValues, backgroundColor: palette(domainLabels.length) }],
              }}
              options={barOptsY()}
              plugins={[barValueLabelsPlugin]}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
          )}
        </div>
      </Card>

      <h2 className="text-xl font-bold text-bright mt-10 mb-4">Performance & Depth Analytics</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {(() => {
          const rtDist = data.response_time_stats?.distribution || {};
          const rtLabels = Object.keys(rtDist);
          const rtValues = Object.values(rtDist).map(Number);
          const rts = data.response_time_stats || {};
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Response Time Distribution</h3>
              <div className="flex gap-4 text-xs text-slate-400 mb-3">
                <span>p50: <span className="text-slate-200 font-semibold">{rts.p50 ?? '—'}ms</span></span>
                <span>p75: <span className="text-slate-200 font-semibold">{rts.p75 ?? '—'}ms</span></span>
                <span>p95: <span className="text-slate-200 font-semibold">{rts.p95 ?? '—'}ms</span></span>
              </div>
              <div className="h-64" role="img" aria-label="Response time histogram">
                {rtLabels.length > 0 ? (
                  <Bar
                    data={{ labels: rtLabels, datasets: [{ data: rtValues, backgroundColor: palette(rtLabels.length) }] }}
                    options={barOpts()}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
                )}
              </div>
            </Card>
          );
        })()}

        {(() => {
          const depthData = data.depth_distribution?.by_depth || {};
          const depthLabels = Object.keys(depthData).sort((a, b) => Number(a) - Number(b));
          const depthValues = depthLabels.map((k) => Number(depthData[k]));
          const dd = data.depth_distribution || {};
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Page Depth Distribution</h3>
              <div className="flex gap-4 text-xs text-slate-400 mb-3">
                <span>Max depth: <span className="text-slate-200 font-semibold">{dd.max_depth ?? '—'}</span></span>
                <span>Avg depth: <span className="text-slate-200 font-semibold">{dd.avg_depth ?? '—'}</span></span>
              </div>
              <div className="h-64" role="img" aria-label="Depth distribution">
                {depthLabels.length > 0 ? (
                  <Bar
                    data={{ labels: depthLabels.map((d) => `Depth ${d}`), datasets: [{ data: depthValues, backgroundColor: palette(1)[0] }] }}
                    options={barOpts()}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
                )}
              </div>
            </Card>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {(() => {
          const topPages = data.top_pages || [];
          const links = data.links || [];
          const inlinkMap = {};
          links.forEach((l) => { inlinkMap[l.url] = l.inlinks || 0; });
          const wordCountMap = {};
          (data.links || []).forEach((l) => { wordCountMap[l.url] = l.word_count || 0; });
          const bubbleData = topPages
            .filter((p) => {
              if (!q) return true;
              const u = (p.url || '').toLowerCase();
              const t = (p.title || '').toLowerCase();
              return u.includes(q) || t.includes(q);
            })
            .slice(0, 40)
            .map((p) => ({
              x: inlinkMap[p.url] || p.degree || 0,
              y: wordCountMap[p.url] || 0,
              r: Math.max(3, Math.min(20, (p.pagerank || 0) * 3000)),
              url: p.url,
            }))
            .filter((d) => d.x > 0 || d.y > 0);
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-200 mb-1">PageRank vs Inlinks vs Word Count</h3>
              <p className="text-xs text-slate-500 mb-3">Bubble size = PageRank weight</p>
              <div className="h-72" role="img" aria-label="Bubble chart: inlinks vs word count">
                {bubbleData.length > 0 ? (
                  <Bubble
                    data={{ datasets: [{ data: bubbleData, backgroundColor: 'rgba(76, 114, 176, 0.5)', borderColor: '#4C72B0', borderWidth: 1 }] }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const d = ctx.raw;
                              const u = d.url ? d.url.replace(/^https?:\/\//, '').slice(0, 50) : '';
                              return [`${u}`, `Inlinks: ${d.x}`, `Words: ${d.y}`];
                            },
                          },
                        },
                      },
                      scales: {
                        x: { grid: { color: GRID_COLOR }, title: { display: true, text: 'Inlinks' } },
                        y: { grid: { color: GRID_COLOR }, title: { display: true, text: 'Word Count' }, beginAtZero: true },
                      },
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">Not enough data</div>
                )}
              </div>
            </Card>
          );
        })()}

        {(() => {
          const links = data.links || [];
          const scatterData = links
            .filter((l) => l.word_count > 0 && l.response_time_ms > 0)
            .filter((l) => {
              if (!q) return true;
              const u = (l.url || '').toLowerCase();
              const t = (l.title || '').toLowerCase();
              return u.includes(q) || t.includes(q);
            })
            .slice(0, 200)
            .map((l) => ({ x: l.word_count, y: l.response_time_ms, url: l.url }));
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Word Count vs Response Time</h3>
              <p className="text-xs text-slate-500 mb-3">Each dot is one page</p>
              <div className="h-72" role="img" aria-label="Scatter chart: word count vs response time">
                {scatterData.length > 0 ? (
                  <Scatter
                    data={{ datasets: [{ data: scatterData, backgroundColor: 'rgba(221, 132, 82, 0.5)', borderColor: '#DD8452', borderWidth: 1, pointRadius: 4 }] }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const r = ctx.raw;
                              const u = r.url ? String(r.url).replace(/^https?:\/\//, '').slice(0, 48) : '';
                              const lines = [`Words: ${r.x}, Time: ${r.y}ms`];
                              if (u) lines.unshift(u);
                              return lines;
                            },
                          },
                        },
                      },
                      scales: {
                        x: { grid: { color: GRID_COLOR }, title: { display: true, text: 'Word Count' }, beginAtZero: true },
                        y: { grid: { color: GRID_COLOR }, title: { display: true, text: 'Response Time (ms)' }, beginAtZero: true },
                      },
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">Not enough data</div>
                )}
              </div>
            </Card>
          );
        })()}
      </div>
    </PageLayout>
  );
}
