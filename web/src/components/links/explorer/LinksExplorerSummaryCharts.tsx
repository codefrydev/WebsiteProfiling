'use client';

import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ReportLink } from '@/types';
import { Card, ChartTitleWithHint } from '@/components';
import { ChartPanel } from '@/components/charts';
import { strings } from '@/lib/strings';
import { statusDistributionFromLinks } from '@/lib/statusDistribution';
import { PALETTE_CATEGORICAL } from '@/utils/chartPalette';
import { getGridColor, getChartTitleColor, registerChartJsBase } from '@/utils/chartJsDefaults';
import type { TooltipItem } from 'chart.js';

function barOptsVertical(yTitle: string, ariaDescription?: string) {
  const o = strings.views.overview;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${Number(ctx.raw).toLocaleString()} ${o.chartUrls}`,
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
    ...(ariaDescription ? { aria: { description: ariaDescription } } : {}),
  };
}

registerChartJsBase();

const WC_BUCKETS = [
  { label: '< 300 words', min: 0, max: 299 },
  { label: '300–999 words', min: 300, max: 999 },
  { label: '1000+ words', min: 1000, max: Infinity },
] as const;

function wordCountBandsFromLinks(links: ReportLink[]): { labels: string[]; values: number[] } | null {
  const counts = WC_BUCKETS.map(() => 0);
  for (const link of links) {
    const wc = link.word_count ?? 0;
    const idx = WC_BUCKETS.findIndex((b) => wc >= b.min && wc <= b.max);
    if (idx >= 0) counts[idx] += 1;
  }
  if (counts.every((c) => c === 0)) return null;
  return {
    labels: WC_BUCKETS.map((b) => b.label),
    values: counts,
  };
}

export interface LinksExplorerSummaryChartsProps {
  links: ReportLink[];
}

export function LinksExplorerSummaryCharts({ links }: LinksExplorerSummaryChartsProps) {
  const vl = strings.views.links;
  const vo = strings.views.overview;

  const statusChart = useMemo(() => statusDistributionFromLinks(links), [links]);
  const wcChart = useMemo(() => wordCountBandsFromLinks(links), [links]);

  if (!statusChart && !wcChart) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
      {statusChart ? (
        <Card padding="tight" shadow className="min-w-0 overflow-hidden">
          <ChartTitleWithHint as="h2" title={vl.chartStatusTitle} helpKey="views.links.chartStatus" />
          <ChartPanel heightClass="h-52">
            <div className="h-full w-full" role="img" aria-label={statusChart.aria}>
              <Bar
                data={{
                  labels: statusChart.labels,
                  datasets: [
                    {
                      label: vo.chartUrls,
                      data: statusChart.values,
                      backgroundColor: PALETTE_CATEGORICAL[0],
                      borderRadius: 4,
                    },
                  ],
                }}
                options={barOptsVertical(vo.chartUrls, statusChart.aria)}
              />
            </div>
          </ChartPanel>
        </Card>
      ) : null}
      {wcChart ? (
        <Card padding="tight" shadow className="min-w-0 overflow-hidden">
          <ChartTitleWithHint as="h2" title={vl.chartWcTitle} helpKey="views.links.chartWc" />
          <ChartPanel heightClass="h-52">
            <Bar
              data={{
                labels: wcChart.labels,
                datasets: [
                  {
                    label: vo.chartPages,
                    data: wcChart.values,
                    backgroundColor: PALETTE_CATEGORICAL[2],
                    borderRadius: 4,
                  },
                ],
              }}
              options={barOptsVertical(vo.chartPages, 'Word count bands across all crawled URLs')}
            />
          </ChartPanel>
        </Card>
      ) : null}
    </div>
  );
}
