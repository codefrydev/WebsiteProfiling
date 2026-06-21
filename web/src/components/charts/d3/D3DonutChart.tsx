'use client';

import { useRef, useState } from 'react';
import { arc, pie } from 'd3-shape';
import { getChartLegendLabelColor } from '@/utils/chartJsDefaults';
import { sliceTotal, slicePercent, filterZeroSlices } from '@/lib/chartDoughnutUtils';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';
import { ChartPanel } from '../ChartPanel';

export interface D3DonutChartProps {
  labels: string[];
  values: number[];
  colors: string[];
  ariaLabel?: string;
  /** If true, show raw counts; otherwise show percentages in legend */
  showCounts?: boolean;
  heightClass?: string;
}

interface TooltipState {
  x: number;
  y: number;
  label: string;
  value: number;
  pct: string;
}

function filterSliceColors(labels: string[], values: number[], colors: string[]): string[] {
  const out: string[] = [];
  labels.forEach((label, i) => {
    if (Number(values[i] ?? 0) > 0) {
      out.push(colors[i] ?? colors[i % colors.length] ?? '#4C72B0');
    }
  });
  return out;
}

export function D3DonutChart({
  labels,
  values,
  colors,
  ariaLabel,
  showCounts = false,
  heightClass = 'h-56',
}: D3DonutChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { labels: filteredLabels, values: filteredValues } = filterZeroSlices(labels, values);
  const filteredColors = filterSliceColors(labels, values, colors);
  const total = sliceTotal(filteredValues);
  const rows: Array<[string, string | number]> = filteredLabels.map((l, i) => [l, filteredValues[i] ?? 0]);
  const legendColor = getChartLegendLabelColor();

  if (total <= 0) return null;

  const LEGEND_ROW_HEIGHT = 20;
  const legendHeight = filteredLabels.length * LEGEND_ROW_HEIGHT + 8;
  const chartWidth = width > 0 ? Math.min(width, 280) : 280;
  const svgHeight = Math.min(chartWidth * 0.6, 180);
  const totalHeight = svgHeight + legendHeight;
  const cx = chartWidth / 2;
  const cy = svgHeight / 2;
  const outerR = Math.max(Math.min(cx, cy) - 6, 0);
  const innerR = outerR * 0.55;

  const pieLayout = pie<number>().sort(null).value((d) => d);
  const arcGen = arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(innerR)
    .outerRadius(outerR);
  const hoverArcGen = arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(innerR)
    .outerRadius(outerR + 6);

  const arcs = pieLayout(filteredValues);

  return (
    <ChartPanel heightClass={heightClass}>
      <ChartAccessibleFallback summary={ariaLabel ?? ''} rows={rows}>
        <div
          ref={containerRef}
          className="flex h-full w-full items-center justify-center"
          role="img"
          aria-label={ariaLabel}
        >
          {width > 0 && outerR > 0 ? (
            <svg
              width={chartWidth}
              height={totalHeight}
              aria-hidden="true"
              className="max-w-[280px]"
              onMouseLeave={() => {
                setTooltip(null);
                setHoveredIndex(null);
              }}
            >
              <g transform={`translate(${cx},${cy})`}>
                {arcs.map((d, i) => {
                  const color = filteredColors[i] ?? '#4C72B0';
                  const isHovered = hoveredIndex === i;
                  const pathD = isHovered
                    ? hoverArcGen({ startAngle: d.startAngle, endAngle: d.endAngle }) ?? ''
                    : arcGen({ startAngle: d.startAngle, endAngle: d.endAngle }) ?? '';

                  return (
                    <path
                      key={filteredLabels[i]}
                      d={pathD}
                      fill={color}
                      stroke="var(--background, #0f172a)"
                      strokeWidth={2}
                      style={{ cursor: 'default', transition: 'all 0.1s' }}
                      onMouseEnter={(e) => {
                        setHoveredIndex(i);
                        const svgRect = (e.currentTarget.ownerSVGElement as SVGElement).getBoundingClientRect();
                        setTooltip({
                          x: e.clientX - svgRect.left,
                          y: e.clientY - svgRect.top - 8,
                          label: filteredLabels[i] ?? '',
                          value: filteredValues[i] ?? 0,
                          pct: slicePercent(filteredValues[i] ?? 0, total).toFixed(1),
                        });
                      }}
                      onMouseLeave={() => {
                        setTooltip(null);
                        setHoveredIndex(null);
                      }}
                    />
                  );
                })}
              </g>

              <g transform={`translate(${Math.max(chartWidth / 2 - 80, 0)},${svgHeight + 4})`}>
                {filteredLabels.map((label, i) => {
                  const color = filteredColors[i] ?? '#4C72B0';
                  const display = showCounts
                    ? `${label} (${(filteredValues[i] ?? 0).toLocaleString()})`
                    : `${label} (${slicePercent(filteredValues[i] ?? 0, total).toFixed(1)}%)`;
                  return (
                    <g key={label} transform={`translate(0,${i * LEGEND_ROW_HEIGHT})`}>
                      <rect width={10} height={10} fill={color} rx={2} />
                      <text x={14} y={9} fontSize={10} fill={legendColor}>
                        {display}
                      </text>
                    </g>
                  );
                })}
              </g>

              {tooltip ? (
                <g transform={`translate(${tooltip.x},${tooltip.y})`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={-4}
                    y={-22}
                    width={Math.max(tooltip.label.length * 6 + 60, 100)}
                    height={24}
                    rx={4}
                    fill="var(--popover, #1e293b)"
                    opacity={0.92}
                  />
                  <text x={4} y={-6} fontSize={11} fill="var(--popover-foreground, #f1f5f9)">
                    {tooltip.label}: {tooltip.value.toLocaleString()} ({tooltip.pct}%)
                  </text>
                </g>
              ) : null}
            </svg>
          ) : null}
        </div>
      </ChartAccessibleFallback>
    </ChartPanel>
  );
}
