
import { useEffect, useMemo, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TooltipItem } from 'chart.js';
import { TrendingUp } from 'lucide-react';
import { Card } from '@/components';
import {
  getChartLegendLabelColor,
  getChartTitleColor,
  getGridColor,
} from '@/utils/chartJsDefaults';
import { PRIORITY_CONFIG, PRIORITY_ORDER, type PriorityKey } from '@/lib/issuePriority';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface HistoryRow {
  generatedAt: string;
  issueCounts: Partial<Record<PriorityKey, number>>;
}

interface IssueTrendChartProps {
  domain: string;
}

function formatAxisDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function IssueTrendChart({ domain }: IssueTrendChartProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!domain) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void apiFetch(apiUrl(`/report/history?domain=${encodeURIComponent(domain)}&limit=10`))
      .then(async (r) => {
        if (!r.ok) return;
        const body = (await r.json()) as { history?: HistoryRow[] };
        // API returns newest-first; reverse so chart reads oldest → newest (left → right)
        setRows([...(body.history ?? [])].reverse());
      })
      .finally(() => setLoading(false));
  }, [domain]);

  const chartData = useMemo(
    () => ({
      labels: rows.map((r) => formatAxisDate(r.generatedAt)),
      datasets: PRIORITY_ORDER.map((p) => ({
        label: p,
        data: rows.map((r) => r.issueCounts?.[p] ?? 0),
        borderColor: PRIORITY_CONFIG[p].chartColor,
        backgroundColor: `${PRIORITY_CONFIG[p].chartColor}20`,
        tension: 0.25,
        fill: false,
        pointRadius: rows.length <= 6 ? 4 : 2,
        borderWidth: 2,
      })),
    }),
    [rows],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: getChartLegendLabelColor(),
            boxWidth: 10,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'line'>) =>
              ` ${ctx.dataset.label ?? ''}: ${Number(ctx.raw).toLocaleString()} issues`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: getGridColor() },
          title: { display: true, text: 'Issue count', color: getChartTitleColor() },
          ticks: { precision: 0 },
        },
        x: { grid: { color: getGridColor() } },
      },
    }),
    [],
  );

  // Need at least 2 snapshots for a trend to be meaningful
  const devData = useMemo(
    () => ({
      widget: 'issues.trendChart',
      domain,
      snapshotCount: rows.length,
      history: rows,
      chart: chartData,
    }),
    [chartData, domain, rows],
  );

  if (!domain || loading || rows.length < 2) return null;

  return (
    <Card padding="tight" shadow overflowHidden devData={devData} className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="h-4 w-4 text-link" />
        <h2 className="text-sm font-bold text-foreground">Issue trend</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Issue counts by priority across the last {rows.length} audits.
      </p>
      <div className="h-52">
        <Line data={chartData} options={options} />
      </div>
    </Card>
  );
}
