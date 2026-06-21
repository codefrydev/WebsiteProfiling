'use client';

import { useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { getGridColor, getChartTitleColor, getChartLegendLabelColor, truncateChartLabel } from '@/utils/chartJsDefaults';
import { palette } from '@/utils/chartPalette';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';
import { ChartPanel } from '../ChartPanel';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';
import type { BarChartData } from '@/lib/viz/types';

const BASE_MARGIN = { top: 8, right: 12, left: 46 } as const;
const TICK_COUNT = 4;
const SVG_HEIGHT = 256;
/** Rotate x labels when categories exceed this count or band width is tight. */
const ROTATE_LABEL_THRESHOLD = 5;
const MIN_BAND_WIDTH_FOR_HORIZONTAL = 48;

export interface D3GroupedBarChartProps {
  data: BarChartData;
  yTitle?: string;
  ariaLabel?: string;
  heightClass?: string;
}

interface TooltipState {
  x: number;
  y: number;
  seriesLabel: string;
  barLabel: string;
  value: number;
}

export function D3GroupedBarChart({
  data,
  yTitle,
  ariaLabel,
  heightClass = 'h-64',
}: D3GroupedBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { labels, series } = data;
  const paletteColors = palette(series.length);
  // Derive a single solid color per series: if all per-bar colors in a series are the same
  // (e.g. produced by dualSeriesToBarChartData), use that; otherwise fall back to palette.
  const seriesColors = series.map((s, si) => {
    if (s.colors && s.colors.length > 0) return s.colors[0]!;
    return paletteColors[si % paletteColors.length] ?? '#4C72B0';
  });

  const rows: Array<[string, string | number]> = series.flatMap((s) =>
    labels.map((l, i) => [`${s.label ?? ''} / ${l}`, s.values[i] ?? 0] as [string, number]),
  );

  const svgHeight = SVG_HEIGHT;
  const innerWidth = Math.max(width - BASE_MARGIN.left - BASE_MARGIN.right, 0);
  const bandWidth = labels.length > 0 ? innerWidth / labels.length : innerWidth;
  const rotateLabels =
    labels.length >= ROTATE_LABEL_THRESHOLD || bandWidth < MIN_BAND_WIDTH_FOR_HORIZONTAL;
  const bottomMargin = rotateLabels ? 76 : 52;
  const margin = { ...BASE_MARGIN, bottom: bottomMargin };
  const innerHeight = svgHeight - margin.top - margin.bottom;
  const labelStep =
    labels.length > 8 ? Math.ceil(labels.length / 8) : labels.length > 5 ? 2 : 1;
  const labelMaxLength = rotateLabels ? 16 : 12;

  const outerScale = scaleBand()
    .domain(labels)
    .range([0, innerWidth])
    .padding(0.25);

  const innerScale = scaleBand()
    .domain(series.map((s) => s.label ?? String(series.indexOf(s))))
    .range([0, outerScale.bandwidth()])
    .padding(0.05);

  const allValues = series.flatMap((s) => s.values);
  const dataMax = max(allValues) ?? 0;
  const yScale = scaleLinear()
    .domain([0, dataMax > 0 ? dataMax * 1.1 : 1])
    .range([innerHeight, 0])
    .nice();

  const yTicks = yScale.ticks(TICK_COUNT);
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
              height={svgHeight}
              aria-hidden="true"
              className="overflow-visible"
              onMouseLeave={() => setTooltip(null)}
            >
              <g transform={`translate(${margin.left},${margin.top})`}>
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
                    transform="rotate(-90)"
                    x={-(innerHeight / 2)}
                    y={-36}
                    textAnchor="middle"
                    fontSize={10}
                    fill={titleColor}
                  >
                    {yTitle}
                  </text>
                )}

                {/* grouped bars */}
                {labels.map((label, labelIndex) => {
                  const groupX = outerScale(label) ?? 0;
                  return (
                    <g key={label} transform={`translate(${groupX},0)`}>
                      {series.map((s, si) => {
                        const seriesKey = s.label ?? String(si);
                        const barX = innerScale(seriesKey) ?? 0;
                        const barWidth = innerScale.bandwidth();
                        const value = s.values[labelIndex] ?? 0;
                        const barHeight = Math.max(0, innerHeight - yScale(value));
                        const barY = yScale(value);
                        const color =
                          s.colors?.[labelIndex] ?? seriesColors[si] ?? '#4C72B0';

                        return (
                          <rect
                            key={seriesKey}
                            x={barX}
                            y={barY}
                            width={barWidth}
                            height={barHeight}
                            fill={color}
                            rx={2}
                            ry={2}
                            onMouseEnter={(e) => {
                              const svgRect = (e.currentTarget.ownerSVGElement as SVGElement).getBoundingClientRect();
                              setTooltip({
                                x: e.clientX - svgRect.left,
                                y: e.clientY - svgRect.top - 8,
                                seriesLabel: s.label ?? '',
                                barLabel: label,
                                value,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                            style={{ cursor: 'default' }}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* x-axis labels — rotate and skip when crowded (Compare metric names) */}
                {labels.map((label, i) => {
                  if (i % labelStep !== 0) return null;
                  const groupX = (outerScale(label) ?? 0) + outerScale.bandwidth() / 2;
                  const truncated = truncateChartLabel(label, labelMaxLength);
                  if (rotateLabels) {
                    return (
                      <text
                        key={label}
                        x={groupX}
                        y={innerHeight + 8}
                        textAnchor="end"
                        fontSize={9}
                        fill={titleColor}
                        transform={`rotate(-45, ${groupX}, ${innerHeight + 8})`}
                      >
                        {truncated}
                      </text>
                    );
                  }
                  return (
                    <text
                      key={label}
                      x={groupX}
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

                {/* legend */}
                {series.map((s, si) => {
                  const legendX = si * Math.min(innerWidth / series.length, 140);
                  const color =
                    s.colors?.[0] ?? seriesColors[si] ?? '#4C72B0';
                  const legendY = innerHeight + (rotateLabels ? 52 : 28);
                  return (
                    <g key={s.label ?? si} transform={`translate(${legendX},${legendY})`}>
                      <rect width={10} height={10} fill={color} rx={2} />
                      <text x={14} y={9} fontSize={10} fill={legendColor}>
                        {s.label ?? `Series ${si + 1}`}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* tooltip */}
              {tooltip && (
                <g transform={`translate(${tooltip.x},${tooltip.y})`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={-4}
                    y={-22}
                    width={Math.max((tooltip.seriesLabel.length + tooltip.barLabel.length) * 6 + 30, 100)}
                    height={24}
                    rx={4}
                    fill="var(--popover, #1e293b)"
                    opacity={0.92}
                  />
                  <text x={4} y={-6} fontSize={11} fill="var(--popover-foreground, #f1f5f9)">
                    {tooltip.seriesLabel}: {tooltip.barLabel} — {tooltip.value.toLocaleString()}
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
