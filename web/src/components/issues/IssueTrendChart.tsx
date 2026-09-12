import { useContext, useEffect, useMemo, useState } from 'react';
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
import { ThemeContext } from '@/context/themeContext';
import { PRIORITY_ORDER, getPriorityChartColor, type PriorityKey } from '@/lib/issuePriority';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface HistoryRow {
  generatedAt: string;
  issueCounts: Partial<Record<PriorityKey, number>>;
}

interface IssueTrendChartProps {
  domain: string;
}

function useIsDark(): boolean {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx.effectiveDark;
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark');
  }
  return false;
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
  const isDark = useIsDark();

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
      datasets: PRIORITY_ORDER.map((p) => {
        const { stroke, fill } = getPriorityChartColor(p, isDark);
        return {
          label: p,
          data: rows.map((r) => r.issueCounts?.[p] ?? 0),
          borderColor: stroke,
          backgroundColor: fill,
          pointBackgroundColor: stroke,
          pointBorderColor: isDark ? '#0b0f19' : '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: rows.length <= 6 ? 4 : 2.5,
          pointHoverRadius: 5,
          tension: 0.25,
          fill: false,
          borderWidth: 2,
        };
      }),
    }),
    [rows, isDark],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            color: isDark ? '#cbd5e1' : '#475569',
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { size: 11, family: "'DM Sans Variable', sans-serif", weight: '500' as const },
          },
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)',
          titleColor: isDark ? '#f8fafc' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#334155',
          borderColor: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.12)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          usePointStyle: true,
          callbacks: {
            label: (ctx: TooltipItem<'line'>) =>
              ` ${ctx.dataset.label ?? ''}: ${Number(ctx.raw).toLocaleString()} issues`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.15)' },
          title: {
            display: true,
            text: 'Issue count',
            color: isDark ? '#94a3b8' : '#64748b',
            font: { size: 11, family: "'DM Sans Variable', sans-serif" },
          },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            precision: 0,
            font: { size: 11, family: "'DM Sans Variable', sans-serif" },
          },
        },
        x: {
          grid: { color: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(100, 116, 139, 0.08)' },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            font: { size: 11, family: "'DM Sans Variable', sans-serif" },
          },
        },
      },
    }),
    [isDark],
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
        <TrendingUp className="h-4 w-4 text-md-sys-primary" />
        <h2 className="text-sm font-bold text-md-sys-on-surface">Issue trend</h2>
      </div>
      <p className="text-xs text-md-sys-on-surface-variant mb-3">
        Issue counts by priority across the last {rows.length} audits.
      </p>
      <div className="h-52">
        <Line data={chartData} options={options} />
      </div>
    </Card>
  );
}
