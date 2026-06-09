'use client';

import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import { Card } from '@/components';
import { ChartAccessibleFallback } from '@/components/charts';
import { strings } from '@/lib/strings';
import type { InlinkAnchorRow, LinkRelSummary } from '@/types/report';
import { formatPageHrefLines } from '@/utils/linkUtils';
import { truncateLabel } from '@/components/google/tableUtils';
import { palette } from '@/utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '@/utils/chartJsDefaults';
import { doughnutOptionsWithPercentTooltip, filterZeroSlices, formatCompositionAria } from '@/lib/chartDoughnutUtils';

registerChartJsBase();

const TOP_N = 10;

function aggregateInlinks(
  rows: InlinkAnchorRow[],
  key: 'anchor_text' | 'target_url',
  limit = TOP_N,
): Array<{ label: string; value: number; title?: string }> {
  const totals = new Map<string, { value: number; title?: string }>();
  for (const row of rows) {
    const raw = (row[key] ?? '').trim();
    const mapKey = raw || '(empty)';
    const prev = totals.get(mapKey)?.value ?? 0;
    const title = key === 'target_url' ? raw || mapKey : undefined;
    totals.set(mapKey, {
      value: prev + (row.inlink_count ?? 0),
      title,
    });
  }
  return [...totals.entries()]
    .map(([label, { value, title }]) => ({
      label: key === 'target_url' ? formatPageHrefLines(title ?? label).label : label,
      value,
      title: title ?? label,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function linkBarOptions(titleAtIndex: (index: number) => string) {
  const base = barOptionsHorizontal();
  return {
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => {
            const idx = items[0]?.dataIndex ?? 0;
            return titleAtIndex(idx) || items[0]?.label || '';
          },
          label: (ctx: TooltipItem<'bar'>) => ` ${Number(ctx.raw).toLocaleString()} inlinks`,
        },
      },
    },
    scales: {
      ...base.scales,
      y: {
        ...(base.scales?.y as object),
        ticks: {
          maxWidth: 112,
          font: { size: 11 },
          callback(this: { getLabelForValue: (v: number) => string }, value: string | number) {
            const label = this.getLabelForValue(Number(value));
            return truncateLabel(label, 36);
          },
        },
      },
    },
  };
}

interface LinkAttributesChartsProps {
  summary?: LinkRelSummary | null;
  anchors?: InlinkAnchorRow[];
  labels: {
    internal: string;
    external: string;
    nofollow: string;
    sponsored: string;
    follow: string;
    ugc: string;
  };
}

export default function LinkAttributesCharts({ summary, anchors, labels }: LinkAttributesChartsProps) {
  const vl = strings.views.links;

  const scopeChart = useMemo(() => {
    if (!summary) return null;
    const internal = summary.internal_edges ?? 0;
    const external = summary.external_edges ?? 0;
    const { labels: sliceLabels, values } = filterZeroSlices(
      [labels.internal, labels.external],
      [internal, external],
    );
    if (values.length === 0) return null;
    return {
      labels: sliceLabels,
      values,
      colors: palette(values.length),
      aria: formatCompositionAria(sliceLabels, values, 'links'),
    };
  }, [summary, labels.internal, labels.external]);

  const internalAttrsChart = useMemo(() => {
    if (!summary) return null;
    const internal = summary.internal_edges ?? 0;
    const nofollow = summary.nofollow_internal ?? 0;
    const sponsored = summary.sponsored_internal ?? 0;
    const ugc = summary.ugc_internal ?? 0;
    const follow = Math.max(0, internal - nofollow - sponsored - ugc);
    const sliceLabels = [labels.follow, labels.nofollow, labels.sponsored, labels.ugc];
    const rawValues = [follow, nofollow, sponsored, ugc];
    const { labels: filteredLabels, values } = filterZeroSlices(sliceLabels, rawValues);
    if (values.length === 0) return null;
    return {
      labels: filteredLabels,
      values,
      colors: palette(values.length),
      aria: formatCompositionAria(filteredLabels, values, 'internal links'),
    };
  }, [summary, labels.follow, labels.nofollow, labels.sponsored, labels.ugc]);

  const topAnchors = useMemo(
    () => (anchors?.length ? aggregateInlinks(anchors, 'anchor_text') : []),
    [anchors],
  );

  const topTargets = useMemo(
    () => (anchors?.length ? aggregateInlinks(anchors, 'target_url') : []),
    [anchors],
  );

  const anchorBarOpts = useMemo(
    () => linkBarOptions((idx) => topAnchors[idx]?.label ?? ''),
    [topAnchors],
  );

  const targetBarOpts = useMemo(
    () => linkBarOptions((idx) => topTargets[idx]?.title ?? topTargets[idx]?.label ?? ''),
    [topTargets],
  );

  const hasCharts = scopeChart || internalAttrsChart || topAnchors.length > 0 || topTargets.length > 0;
  if (!hasCharts) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
      {scopeChart ? (
        <Card padding="tight" shadow className="min-w-0 overflow-hidden">
          <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartLinkScopeTitle}</h2>
          <p className="text-xs text-muted-foreground mb-3">{vl.chartLinkScopeHint}</p>
          <div className="h-56 flex items-center justify-center">
            <div className="w-full max-w-[260px] h-48">
              <ChartAccessibleFallback
                summary={scopeChart.aria}
                rows={scopeChart.labels.map((label, i) => [label, scopeChart.values[i] ?? 0])}
              >
                <Doughnut
                  data={{
                    labels: scopeChart.labels,
                    datasets: [
                      {
                        data: scopeChart.values,
                        backgroundColor: scopeChart.colors,
                        borderColor: 'rgba(15,23,42,0.8)',
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={doughnutOptionsWithPercentTooltip()}
                />
              </ChartAccessibleFallback>
            </div>
          </div>
        </Card>
      ) : null}

      {internalAttrsChart ? (
        <Card padding="tight" shadow className="min-w-0 overflow-hidden">
          <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartInternalAttrsTitle}</h2>
          <p className="text-xs text-muted-foreground mb-3">{vl.chartInternalAttrsHint}</p>
          <div className="h-56 flex items-center justify-center">
            <div className="w-full max-w-[260px] h-48">
              <ChartAccessibleFallback
                summary={internalAttrsChart.aria}
                rows={internalAttrsChart.labels.map((label, i) => [label, internalAttrsChart.values[i] ?? 0])}
              >
                <Doughnut
                  data={{
                    labels: internalAttrsChart.labels,
                    datasets: [
                      {
                        data: internalAttrsChart.values,
                        backgroundColor: internalAttrsChart.colors,
                        borderColor: 'rgba(15,23,42,0.8)',
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={doughnutOptionsWithPercentTooltip()}
                />
              </ChartAccessibleFallback>
            </div>
          </div>
        </Card>
      ) : null}

      {topAnchors.length > 0 ? (
        <Card padding="tight" shadow className="min-w-0 overflow-hidden">
          <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartTopAnchorsTitle}</h2>
          <p className="text-xs text-muted-foreground mb-3">{vl.chartTopAnchorsHint}</p>
          <div className="relative h-72 min-w-0 w-full overflow-hidden">
            <ChartAccessibleFallback
              summary={formatCompositionAria(
                topAnchors.map((r) => r.label),
                topAnchors.map((r) => r.value),
                'inlinks',
              )}
              rows={topAnchors.map((r) => [r.label, r.value])}
            >
              <Bar
                data={{
                  labels: topAnchors.map((r) => truncateLabel(r.label, 36)),
                  datasets: [
                    {
                      data: topAnchors.map((r) => r.value),
                      backgroundColor: palette(topAnchors.length),
                      borderRadius: 4,
                    },
                  ],
                }}
                options={anchorBarOpts}
              />
            </ChartAccessibleFallback>
          </div>
        </Card>
      ) : null}

      {topTargets.length > 0 ? (
        <Card padding="tight" shadow className="min-w-0 overflow-hidden">
          <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartTopTargetsTitle}</h2>
          <p className="text-xs text-muted-foreground mb-3">{vl.chartTopTargetsHint}</p>
          <div className="relative h-72 min-w-0 w-full overflow-hidden">
            <ChartAccessibleFallback
              summary={formatCompositionAria(
                topTargets.map((r) => r.title ?? r.label),
                topTargets.map((r) => r.value),
                'inlinks',
              )}
              rows={topTargets.map((r) => [r.title ?? r.label, r.value])}
            >
              <Bar
                data={{
                  labels: topTargets.map((r) => truncateLabel(r.label, 36)),
                  datasets: [
                    {
                      data: topTargets.map((r) => r.value),
                      backgroundColor: palette(topTargets.length),
                      borderRadius: 4,
                    },
                  ],
                }}
                options={targetBarOpts}
              />
            </ChartAccessibleFallback>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
