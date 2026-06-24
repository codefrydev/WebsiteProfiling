
import { useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { getGridColor, getChartTitleColor, getChartLegendLabelColor } from '@/utils/chartJsDefaults';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';
import { ChartPanel } from '../ChartPanel';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';
import type { StackedBarSeries } from './D3StackedVerticalBarChart';

const MARGIN = { top: 8, right: 16, bottom: 52, left: 10 };
const SVG_HEIGHT = 256;

export interface D3StackedHorizontalBarChartProps {
  labels: string[];
  series: StackedBarSeries[];
  xMax?: number;
  xTitle?: string;
  ariaLabel?: string;
  heightClass?: string;
}

interface TooltipState {
  x: number;
  y: number;
  category: string;
  seriesLabel: string;
  value: number;
}

/** Horizontal stacked bar chart (categories on Y, values stack on X to xMax). */
export function D3StackedHorizontalBarChart({
  labels,
  series,
  xMax = 100,
  xTitle,
  ariaLabel,
  heightClass = 'h-64',
}: D3StackedHorizontalBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const rows: Array<[string, string | number]> = labels.flatMap((label, li) =>
    series.map((s) => [`${label} / ${s.label}`, `${Number(s.values[li] ?? 0).toFixed(1)}%`] as [string, string | number]),
  );

  const leftMargin = Math.min(Math.max(Math.max(...labels.map((l) => l.length)) * 6.5, 80), 140);
  const innerWidth = Math.max(width - leftMargin - MARGIN.right, 0);
  const innerHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

  const yScale = scaleBand().domain(labels).range([0, innerHeight]).padding(0.35);
  const xScale = scaleLinear().domain([0, xMax]).range([0, innerWidth]).nice();

  const xTicks = xScale.ticks(5);
  const gridColor = getGridColor();
  const titleColor = getChartTitleColor();
  const legendColor = getChartLegendLabelColor();

  return (
    <ChartPanel heightClass={heightClass}>
      <ChartAccessibleFallback summary={ariaLabel ?? ''} rows={rows}>
        <div ref={containerRef} className="h-full w-full" role="img" aria-label={ariaLabel}>
          {width > 0 && (
            <svg
              width={width}
              height={SVG_HEIGHT}
              aria-hidden="true"
              className="overflow-visible"
              onMouseLeave={() => setTooltip(null)}
            >
              <g transform={`translate(${leftMargin},${MARGIN.top})`}>
                {xTicks.map((tick) => (
                  <line
                    key={tick}
                    x1={xScale(tick)}
                    x2={xScale(tick)}
                    y1={0}
                    y2={innerHeight}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                ))}

                {xTicks.map((tick) => (
                  <text
                    key={tick}
                    x={xScale(tick)}
                    y={innerHeight + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={titleColor}
                  >
                    {tick}
                  </text>
                ))}

                {xTitle && (
                  <text
                    x={innerWidth / 2}
                    y={innerHeight + 28}
                    textAnchor="middle"
                    fontSize={10}
                    fill={titleColor}
                  >
                    {xTitle}
                  </text>
                )}

                {labels.map((label, li) => {
                  const barY = yScale(label) ?? 0;
                  const barHeight = yScale.bandwidth();
                  let stackBase = 0;

                  return (
                    <g key={label} transform={`translate(0,${barY})`}>
                      {series.map((s) => {
                        const value = s.values[li] ?? 0;
                        const x = xScale(stackBase);
                        const w = Math.max(0, xScale(stackBase + value) - xScale(stackBase));
                        stackBase += value;

                        return (
                          <rect
                            key={s.label}
                            x={x}
                            y={0}
                            width={w}
                            height={barHeight}
                            fill={s.color}
                            rx={2}
                            onMouseEnter={(e) => {
                              const svgRect = (
                                e.currentTarget.ownerSVGElement as SVGElement
                              ).getBoundingClientRect();
                              setTooltip({
                                x: e.clientX - svgRect.left,
                                y: e.clientY - svgRect.top - 8,
                                category: label,
                                seriesLabel: s.label,
                                value,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                            style={{ cursor: 'default' }}
                          />
                        );
                      })}
                      <text
                        x={-6}
                        y={barHeight / 2}
                        textAnchor="end"
                        dominantBaseline="middle"
                        fontSize={10}
                        fill={titleColor}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}

                {series.map((s, si) => {
                  const legendX = si * Math.min(innerWidth / series.length, 160);
                  return (
                    <g key={s.label} transform={`translate(${legendX},${innerHeight + 40})`}>
                      <rect width={10} height={10} fill={s.color} rx={2} />
                      <text x={14} y={9} fontSize={10} fill={legendColor}>
                        {s.label}
                      </text>
                    </g>
                  );
                })}
              </g>

              {tooltip && (
                <g transform={`translate(${tooltip.x},${tooltip.y})`} style={{ pointerEvents: 'none' }}>
                  <rect x={-4} y={-22} width={140} height={24} rx={4} fill="var(--popover, #1e293b)" opacity={0.92} />
                  <text x={4} y={-6} fontSize={11} fill="var(--popover-foreground, #f1f5f9)">
                    {tooltip.seriesLabel}: {tooltip.value.toFixed(1)}%
                  </text>
                </g>
              )}
            </svg>
          )}
        </div>
      </ChartAccessibleFallback>
    </ChartPanel>
  );
}
