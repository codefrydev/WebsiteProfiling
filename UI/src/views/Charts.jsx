import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Bubble, Scatter } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card } from '../components';
import BrowserMlPanel from '../components/ml/BrowserMlPanel';
import { palette, sortByValue } from '../utils/chartPalette';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, PointElement, Title, Tooltip, Legend);

if (typeof ChartJS.defaults?.font !== 'undefined') {
  ChartJS.defaults.font.size = 11;
  ChartJS.defaults.color = 'rgb(203, 213, 225)';
}

const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

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

export default function Charts({ searchQuery = '' }) {
  const vc = strings.views.charts;
  const ch = strings.charts;
  const sj = strings.common;
  const { data } = useReport();

  function barOptsY(ariaSummary) {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw} ${ch.axisUrls}`,
          },
        },
      },
      scales: {
        x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: ch.axisCount } },
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
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw} ${ch.axisUrls}`,
          },
        },
      },
      scales: {
        x: { grid: { color: GRID_COLOR } },
        y: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: ch.axisCount } },
      },
      ...(ariaSummary && { aria: { description: ariaSummary } }),
    };
  }

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
    ? `${vc.ariaStatusPrefix} ${statusLabels.map((l, i) => `${statusValues[i]} ${l}`).join(', ')}.`
    : vc.ariaNoStatus;

  return (
    <PageLayout>
      <PageHeader title={vc.title} subtitle={vc.subtitle} />
      {Array.isArray(data?.links) && data.links.length > 0 && (
        <Card shadow className="mb-6">
          <BrowserMlPanel links={data.links} compact />
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.statusDist}</h3>
          <p className="text-xs text-slate-500 mb-3">
            {vc.statusHintPrefix}
            {totalUrls ? ` · ${totalUrls.toLocaleString()} ${ch.axisUrls}` : ''}
          </p>
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
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
            )}
          </div>
        </Card>
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.topMime}</h3>
          <p className="text-xs text-slate-500 mb-3">{vc.mimeByCount}</p>
          <div className="h-64" role="img" aria-label={mimeLabels.length ? `${vc.ariaMime} ${mimeLabels[0]}: ${mimeValues[0]}.` : sj.noData}>
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
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
            )}
          </div>
        </Card>
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.outlinksTitle}</h3>
          <p className="text-xs text-slate-500 mb-3">{vc.outlinksHint}</p>
          <div className="h-64" role="img" aria-label={outlinkLabels.length ? vc.ariaOutlinks : sj.noData}>
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
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
            )}
          </div>
        </Card>
        <Card padding="tight" className="print:break-inside-avoid">
          <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.titleLength}</h3>
          <p className="text-xs text-slate-500 mb-3">{vc.titleLengthHint}</p>
          <div className="h-64" role="img" aria-label={titleLabels.length ? vc.ariaTitleLen : sj.noData}>
            {titleLabels.length > 0 ? (
              <Bar
                data={{
                  labels: titleLabels,
                  datasets: [{ data: titleCounts, backgroundColor: palette(1)[1] }],
                }}
                options={(() => {
                  const opts = barOpts();
                  return {
                    ...opts,
                    scales: {
                      ...opts.scales,
                      x: { ...opts.scales.x, title: { display: true, text: ch.axisCharacterCount } },
                    },
                  };
                })()}
                plugins={[barValueLabelsPlugin]}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
            )}
          </div>
        </Card>
      </div>
      <Card padding="tight" className="print:break-inside-avoid">
        <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.topDomains}</h3>
        <p className="text-xs text-slate-500 mb-3">{vc.topDomainsHint}</p>
        <div className="h-64" role="img" aria-label={domainLabels.length ? `${vc.ariaDomainsPrefix} ${domainLabels[0]}: ${domainValues[0]}.` : sj.noData}>
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
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
          )}
        </div>
      </Card>

      <h2 className="text-xl font-bold text-bright mt-10 mb-4">{vc.perfDepthTitle}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {(() => {
          const rtDist = data.response_time_stats?.distribution || {};
          const rtLabels = Object.keys(rtDist);
          const rtValues = Object.values(rtDist).map(Number);
          const rts = data.response_time_stats || {};
          return (
            <Card padding="tight" className="print:break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.rtDistTitle}</h3>
              <div className="flex gap-4 text-xs text-slate-400 mb-3">
                <span>{vc.rtP50} <span className="text-slate-200 font-semibold">{rts.p50 ?? sj.emDash}ms</span></span>
                <span>{vc.rtP75} <span className="text-slate-200 font-semibold">{rts.p75 ?? sj.emDash}ms</span></span>
                <span>{vc.rtP95} <span className="text-slate-200 font-semibold">{rts.p95 ?? sj.emDash}ms</span></span>
              </div>
              <div className="h-64" role="img" aria-label={vc.rtAria}>
                {rtLabels.length > 0 ? (
                  <Bar
                    data={{ labels: rtLabels, datasets: [{ data: rtValues, backgroundColor: palette(rtLabels.length) }] }}
                    options={barOpts()}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
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
              <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.depthDistTitle}</h3>
              <div className="flex gap-4 text-xs text-slate-400 mb-3">
                <span>{vc.maxDepth} <span className="text-slate-200 font-semibold">{dd.max_depth ?? sj.emDash}</span></span>
                <span>{vc.avgDepth} <span className="text-slate-200 font-semibold">{dd.avg_depth ?? sj.emDash}</span></span>
              </div>
              <div className="h-64" role="img" aria-label={vc.depthAria}>
                {depthLabels.length > 0 ? (
                  <Bar
                    data={{
                      labels: depthLabels.map((d) => `Depth ${d}`),
                      datasets: [{ data: depthValues, backgroundColor: palette(1)[0] }],
                    }}
                    options={barOpts()}
                    plugins={[barValueLabelsPlugin]}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.noData}</div>
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
              <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.bubbleTitle}</h3>
              <p className="text-xs text-slate-500 mb-3">{vc.bubbleHint}</p>
              <div className="h-72" role="img" aria-label={vc.bubbleAria}>
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
                              return [`${u}`, `${ch.axisInlinks}: ${d.x}`, `${ch.axisWordCount}: ${d.y}`];
                            },
                          },
                        },
                      },
                      scales: {
                        x: { grid: { color: GRID_COLOR }, title: { display: true, text: ch.axisInlinks } },
                        y: { grid: { color: GRID_COLOR }, title: { display: true, text: ch.axisWordCount }, beginAtZero: true },
                      },
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.notEnoughData}</div>
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
              <h3 className="text-sm font-bold text-slate-200 mb-1">{vc.scatterTitle}</h3>
              <p className="text-xs text-slate-500 mb-3">{vc.scatterHint}</p>
              <div className="h-72" role="img" aria-label={vc.scatterAria}>
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
                              const lines = [`${ch.axisWordCount}: ${r.x}, ${ch.axisResponseTimeMs}: ${r.y}ms`];
                              if (u) lines.unshift(u);
                              return lines;
                            },
                          },
                        },
                      },
                      scales: {
                        x: { grid: { color: GRID_COLOR }, title: { display: true, text: ch.axisWordCount }, beginAtZero: true },
                        y: { grid: { color: GRID_COLOR }, title: { display: true, text: ch.axisResponseTimeMs }, beginAtZero: true },
                      },
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{sj.notEnoughData}</div>
                )}
              </div>
            </Card>
          );
        })()}
      </div>
    </PageLayout>
  );
}
