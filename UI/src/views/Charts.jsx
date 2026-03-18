import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card } from '../components';
import { palette, sortByValue } from '../utils/chartPalette';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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

export default function Charts() {
  const { data } = useReport();

  if (!data) return null;

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
        title="Chart.js Analytics Hub"
        subtitle="Status, content types, outlinks, title length, and domain distribution."
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
    </PageLayout>
  );
}
