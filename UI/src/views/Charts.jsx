import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useReport } from '../context/useReport';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const PALETTE = ['#3B82F6', '#64748b', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function barOptsY() {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(71, 85, 105, 0.5)' }, beginAtZero: true },
      y: { grid: { color: 'rgba(71, 85, 105, 0.5)' } },
    },
  };
}

function barOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(71, 85, 105, 0.5)' } },
      y: { grid: { color: 'rgba(71, 85, 105, 0.5)' }, beginAtZero: true },
    },
  };
}

export default function Charts() {
  const { data } = useReport();

  if (!data) return null;

  const statusLabels = Object.keys(data.status_counts || {});
  const statusValues = Object.values(data.status_counts || {});
  const mimeLabels = data.mime_labels || [];
  const mimeValues = (data.mime_values || []).map(Number);
  const outlinkLabels = data.outlink_labels || [];
  const outlinkCounts = (data.outlink_counts || []).map(Number);
  const titleLabels = data.title_labels || [];
  const titleCounts = (data.title_counts || []).map(Number);
  const domainLabels = data.domain_labels || [];
  const domainValues = (data.domain_values || []).map(Number);

  const pal = (n) => Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Chart.js Analytics Hub</h1>
        <p className="text-slate-400">
          Status, content types, outlinks, title length, and domain distribution.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-brand-800 border border-slate-700 rounded-xl p-4 print:break-inside-avoid">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Status counts</h3>
          <div className="h-64">
            {statusLabels.length > 0 ? (
              <Bar
                data={{
                  labels: statusLabels,
                  datasets: [{ data: statusValues, backgroundColor: pal(statusLabels.length) }],
                }}
                options={barOptsY()}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </div>
        <div className="bg-brand-800 border border-slate-700 rounded-xl p-4 print:break-inside-avoid">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Top content-types</h3>
          <div className="h-64">
            {mimeLabels.length > 0 ? (
              <Bar
                data={{
                  labels: mimeLabels.slice(0, 12),
                  datasets: [{ data: mimeValues.slice(0, 12), backgroundColor: pal(mimeLabels.length) }],
                }}
                options={barOpts()}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </div>
        <div className="bg-brand-800 border border-slate-700 rounded-xl p-4 print:break-inside-avoid">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Outlinks distribution</h3>
          <div className="h-64">
            {outlinkLabels.length > 0 ? (
              <Bar
                data={{
                  labels: outlinkLabels,
                  datasets: [{ data: outlinkCounts, backgroundColor: PALETTE[0] }],
                }}
                options={barOpts()}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </div>
        <div className="bg-brand-800 border border-slate-700 rounded-xl p-4 print:break-inside-avoid">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Title length distribution</h3>
          <div className="h-64">
            {titleLabels.length > 0 ? (
              <Bar
                data={{
                  labels: titleLabels,
                  datasets: [{ data: titleCounts, backgroundColor: PALETTE[1] }],
                }}
                options={barOpts()}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
            )}
          </div>
        </div>
      </div>
      <div className="bg-brand-800 border border-slate-700 rounded-xl p-4 print:break-inside-avoid">
        <h3 className="text-sm font-medium text-slate-200 mb-3">Top domains discovered</h3>
        <div className="h-64">
          {domainLabels.length > 0 ? (
            <Bar
              data={{
                labels: domainLabels.slice(0, 10),
                datasets: [{ data: domainValues.slice(0, 10), backgroundColor: pal(domainLabels.length) }],
              }}
              options={barOptsY()}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>
          )}
        </div>
      </div>
    </div>
  );
}
