'use client';

import { useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { getGridColor, getChartTitleColor } from '@/utils/chartJsDefaults';
import { palette } from '@/utils/chartPalette';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';
import { ChartPanel } from '../ChartPanel';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';
import type { BarChartData } from '@/lib/viz/types';

const MARGIN = { top: 8, right: 12, bottom: 36, left: 46 };
const TICK_COUNT = 4;

export interface D3VerticalBarChartProps {
  data: BarChartData;
  yTitle?: string;
  ariaLabel?: string;
  heightClass?: string;
}

interface TooltipState {
  x: number;
  y: number;
  label: string;
  value: number;
}

export function D3VerticalBarChart({
  data,
  yTitle,
  ariaLabel,
  heightClass = 'h-64',
}: D3VerticalBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { labels, series } = data;
  const singleSeries = series[0];
  const values = singleSeries?.values ?? [];
  const colors = singleSeries?.colors ?? palette(labels.length);

  const rows: Array<[string, number]> = labels.map((l, i) => [l, values[i] ?? 0]);
  const svgHeight = 256;
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = svgHeight - MARGIN.top - MARGIN.bottom;

  const xScale = scaleBand()
    .domain(labels)
    .range([0, innerWidth])
    .padding(0.3);

  const dataMax = max(values) ?? 0;
  const yScale = scaleLinear()
    .domain([0, dataMax > 0 ? dataMax * 1.1 : 1])
    .range([innerHeight, 0])
    .nice();

  const yTicks = yScale.ticks(TICK_COUNT);
  const gridColor = getGridColor();
  const titleColor = getChartTitleColor();

  return (
    <ChartPanel heightClass={heightClass}>
      <ChartAccessibleFallback summary={ariaLabel ?? ''} rows={rows}>
        <div ref={containerRef} className="h-full w-full" role="img" aria-label={ariaLabel}>
          {width > 0 && (
            <svg
              width={width}
              height={svgHeight}
              aria-hidden="true"
              className="overflow-visible"
              onMouseLeave={() => setTooltip(null)}
            >
              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {/* horizontal grid lines */}
                {yTicks.map((tick) => (
                  <line
                    key={tick}
                    x1={0}
                    x2={innerWidth}
                    y1={yScale(tick)}
                    y2={yScale(tick)}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                ))}

                {/* y-axis ticks */}
                {yTicks.map((tick) => (
                  <text
                    key={tick}
                    x={-6}
                    y={yScale(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill={titleColor}
                  >
                    {tick.toLocaleString()}
                  </text>
                ))}

                {/* y-axis title */}
                {yTitle && (
                  <text
                    transform={`rotate(-90)`}
                    x={-(innerHeight / 2)}
                    y={-36}
                    textAnchor="middle"
                    fontSize={10}
                    fill={titleColor}
                  >
                    {yTitle}
                  </text>
                )}

                {/* bars */}
                {labels.map((label, i) => {
                  const barX = xScale(label) ?? 0;
                  const barWidth = xScale.bandwidth();
                  const value = values[i] ?? 0;
                  const barHeight = Math.max(0, innerHeight - yScale(value));
                  const barY = yScale(value);
                  const color = colors[i] ?? colors[i % colors.length] ?? '#4C72B0';

                  return (
                    <rect
                      key={label}
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      fill={color}
                      rx={3}
                      ry={3}
                      onMouseEnter={(e) => {
                        const svgRect = (e.currentTarget.ownerSVGElement as SVGElement).getBoundingClientRect();
                        setTooltip({
                          x: e.clientX - svgRect.left,
                          y: e.clientY - svgRect.top - 8,
                          label,
                          value,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'default' }}
                    />
                  );
                })}

                {/* x-axis labels */}
                {labels.map((label) => {
                  const barX = (xScale(label) ?? 0) + xScale.bandwidth() / 2;
                  const truncated = label.length > 12 ? `${label.slice(0, 11)}…` : label;
                  return (
                    <text
                      key={label}
                      x={barX}
                      y={innerHeight + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={titleColor}
                    >
                      {truncated}
                    </text>
                  );
                })}

                {/* x baseline */}
                <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke={gridColor} strokeWidth={1} />
              </g>

              {/* tooltip */}
              {tooltip && (
                <g transform={`translate(${tooltip.x},${tooltip.y})`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={-4}
                    y={-22}
                    width={Math.max(tooltip.label.length * 6 + tooltip.value.toLocaleString().length * 7 + 20, 80)}
                    height={24}
                    rx={4}
                    fill="var(--popover, #1e293b)"
                    opacity={0.92}
                  />
                  <text x={4} y={-6} fontSize={11} fill="var(--popover-foreground, #f1f5f9)">
                    {tooltip.label}: {tooltip.value.toLocaleString()}
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
