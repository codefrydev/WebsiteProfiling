'use client';

import { useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { getGridColor, getChartTitleColor, truncateChartLabel } from '@/utils/chartJsDefaults';
import { palette } from '@/utils/chartPalette';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';
import { ChartPanel } from '../ChartPanel';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';
import type { BarChartData } from '@/lib/viz/types';

const MARGIN = { top: 6, right: 50, bottom: 28, left: 10 };
const TICK_COUNT = 4;
const MAX_LABEL_PX = 130;
const LABEL_CHAR_WIDTH = 6.5;

export interface D3HorizontalBarChartProps {
  data: BarChartData;
  xTitle?: string;
  ariaLabel?: string;
  heightClass?: string;
  /** Override SVG pixel height (defaults to 256; increase for many categories). */
  svgHeight?: number;
}

interface TooltipState {
  x: number;
  y: number;
  label: string;
  value: number;
}

export function D3HorizontalBarChart({
  data,
  xTitle,
  ariaLabel,
  heightClass = 'h-64',
  svgHeight: svgHeightProp,
}: D3HorizontalBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { labels, series } = data;
  const singleSeries = series[0];
  const values = singleSeries?.values ?? [];
  const colors = singleSeries?.colors ?? palette(labels.length);

  const rows: Array<[string, number]> = labels.map((l, i) => [l, values[i] ?? 0]);
  const svgHeight = svgHeightProp ?? Math.max(256, labels.length * 28 + MARGIN.top + MARGIN.bottom);

  // Dynamic left margin based on longest label
  const maxLabelLen = Math.max(...labels.map((l) => Math.min(l.length, 28)));
  const leftMargin = Math.min(Math.max(maxLabelLen * LABEL_CHAR_WIDTH, 80), MAX_LABEL_PX);

  const innerWidth = Math.max(width - leftMargin - MARGIN.right, 0);
  const innerHeight = svgHeight - MARGIN.top - MARGIN.bottom;

  const yScale = scaleBand()
    .domain(labels)
    .range([0, innerHeight])
    .padding(0.3);

  const dataMax = max(values) ?? 0;
  const xScale = scaleLinear()
    .domain([0, dataMax > 0 ? dataMax * 1.1 : 1])
    .range([0, innerWidth])
    .nice();

  const xTicks = xScale.ticks(TICK_COUNT);
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
              <g transform={`translate(${leftMargin},${MARGIN.top})`}>
                {/* vertical grid lines */}
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

                {/* x-axis ticks */}
                {xTicks.map((tick) => (
                  <text
                    key={tick}
                    x={xScale(tick)}
                    y={innerHeight + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={titleColor}
                  >
                    {tick.toLocaleString()}
                  </text>
                ))}

                {/* x-axis title */}
                {xTitle && (
                  <text
                    x={innerWidth / 2}
                    y={innerHeight + 26}
                    textAnchor="middle"
                    fontSize={10}
                    fill={titleColor}
                  >
                    {xTitle}
                  </text>
                )}

                {/* bars */}
                {labels.map((label, i) => {
                  const barY = yScale(label) ?? 0;
                  const barHeight = yScale.bandwidth();
                  const value = values[i] ?? 0;
                  const barWidth = Math.max(0, xScale(value));
                  const color = colors[i % colors.length] ?? '#4C72B0';

                  return (
                    <rect
                      key={label}
                      x={0}
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

                {/* y-axis labels (left of chart) */}
                {labels.map((label) => {
                  const barY = (yScale(label) ?? 0) + yScale.bandwidth() / 2;
                  const truncated = truncateChartLabel(label);
                  return (
                    <text
                      key={label}
                      x={-6}
                      y={barY}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={10}
                      fill={titleColor}
                    >
                      {truncated}
                    </text>
                  );
                })}

                {/* y baseline */}
                <line x1={0} x2={0} y1={0} y2={innerHeight} stroke={gridColor} strokeWidth={1} />
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
                    {truncateChartLabel(tooltip.label, 20)}: {tooltip.value.toLocaleString()}
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
