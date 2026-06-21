'use client';

import { useRef, useState } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { line as d3Line, curveMonotoneX } from 'd3-shape';
import { max } from 'd3-array';
import {
  getGridColor,
  getChartTitleColor,
  getChartLegendLabelColor,
} from '@/utils/chartJsDefaults';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';
import { ChartPanel } from '../ChartPanel';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';
import type { DualSeriesChartData } from '@/lib/compareChartData';

const COLOR_BASELINE = '#94a3b8';
const COLOR_CURRENT = '#3b82f6';
const MARGIN = { top: 12, right: 16, bottom: 60, left: 46 };
const TICK_COUNT = 4;
// Auto-skip x-axis labels when there are many data points
const MAX_X_LABELS = 10;

export interface D3DualLineChartProps {
  series: DualSeriesChartData;
  baselineLabel: string;
  currentLabel: string;
  colors?: { baseline?: string; current?: string };
  heightClass?: string;
  ariaLabel?: string;
}

interface TooltipState {
  x: number;
  y: number;
  index: number;
  label: string;
  baselineValue: number | null;
  currentValue: number | null;
}

export function D3DualLineChart({
  series,
  baselineLabel,
  currentLabel,
  colors,
  heightClass = 'h-64',
  ariaLabel,
}: D3DualLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const baseColor = colors?.baseline ?? COLOR_BASELINE;
  const curColor = colors?.current ?? COLOR_CURRENT;

  const { labels, baseline, current } = series;
  const svgHeight = 256;
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = svgHeight - MARGIN.top - MARGIN.bottom;

  // Accessible table rows: [label, baseline, current]
  const tableRows: Array<[string, string | number]> = labels.map((l, i) => [
    l,
    `${baselineLabel}: ${baseline[i] ?? '—'} / ${currentLabel}: ${current[i] ?? '—'}`,
  ]);

  const xScale = scalePoint<string>().domain(labels).range([0, innerWidth]).padding(0.1);

  const allValues = [...baseline, ...current].filter((v): v is number => v !== null);
  const dataMax = max(allValues) ?? 0;
  const yScale = scaleLinear()
    .domain([0, dataMax > 0 ? dataMax * 1.1 : 1])
    .range([innerHeight, 0])
    .nice();

  const yTicks = yScale.ticks(TICK_COUNT);

  // Line generator: skips null points (creates gaps)
  const lineGen = d3Line<number | null>()
    .defined((v) => v !== null)
    .x((_, i) => xScale(labels[i]!) ?? 0)
    .y((v) => yScale(v ?? 0))
    .curve(curveMonotoneX);

  const baselinePath = lineGen(baseline) ?? '';
  const currentPath = lineGen(current) ?? '';

  // Dot positions for mouse hover areas (only non-null points get dots)
  const baselineDots = labels
    .map((l, i) => ({ x: xScale(l) ?? 0, y: yScale(baseline[i] ?? 0), i, v: baseline[i] }))
    .filter((d) => d.v !== null);
  const currentDots = labels
    .map((l, i) => ({ x: xScale(l) ?? 0, y: yScale(current[i] ?? 0), i, v: current[i] }))
    .filter((d) => d.v !== null);

  const gridColor = getGridColor();
  const titleColor = getChartTitleColor();
  const legendColor = getChartLegendLabelColor();

  // Decide which x labels to show (skip if crowded)
  const step = labels.length > MAX_X_LABELS ? Math.ceil(labels.length / MAX_X_LABELS) : 1;

  return (
    <ChartPanel heightClass={heightClass}>
      <ChartAccessibleFallback summary={ariaLabel ?? ''} rows={tableRows}>
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

                {/* x baseline */}
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={innerHeight}
                  y2={innerHeight}
                  stroke={gridColor}
                  strokeWidth={1}
                />

                {/* x-axis labels — rotated 45° and auto-skipped when crowded */}
                {labels.map((label, i) => {
                  if (i % step !== 0) return null;
                  const lx = xScale(label) ?? 0;
                  return (
                    <text
                      key={label}
                      x={lx}
                      y={innerHeight + 10}
                      textAnchor="end"
                      fontSize={9}
                      fill={titleColor}
                      transform={`rotate(-45, ${lx}, ${innerHeight + 10})`}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* lines */}
                <path d={baselinePath} fill="none" stroke={baseColor} strokeWidth={2} />
                <path d={currentPath} fill="none" stroke={curColor} strokeWidth={2} />

                {/* dots for baseline */}
                {baselineDots.map((d) => (
                  <circle
                    key={`b-${d.i}`}
                    cx={d.x}
                    cy={d.y}
                    r={3}
                    fill={baseColor}
                    stroke="var(--background, #fff)"
                    strokeWidth={1.5}
                    style={{ cursor: 'default' }}
                    onMouseEnter={(e) => {
                      const svgRect = (
                        e.currentTarget.ownerSVGElement as SVGElement
                      ).getBoundingClientRect();
                      setTooltip({
                        x: e.clientX - svgRect.left,
                        y: e.clientY - svgRect.top - 8,
                        index: d.i,
                        label: labels[d.i] ?? '',
                        baselineValue: baseline[d.i] ?? null,
                        currentValue: current[d.i] ?? null,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}

                {/* dots for current */}
                {currentDots.map((d) => (
                  <circle
                    key={`c-${d.i}`}
                    cx={d.x}
                    cy={d.y}
                    r={3}
                    fill={curColor}
                    stroke="var(--background, #fff)"
                    strokeWidth={1.5}
                    style={{ cursor: 'default' }}
                    onMouseEnter={(e) => {
                      const svgRect = (
                        e.currentTarget.ownerSVGElement as SVGElement
                      ).getBoundingClientRect();
                      setTooltip({
                        x: e.clientX - svgRect.left,
                        y: e.clientY - svgRect.top - 8,
                        index: d.i,
                        label: labels[d.i] ?? '',
                        baselineValue: baseline[d.i] ?? null,
                        currentValue: current[d.i] ?? null,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}

                {/* legend */}
                <g transform={`translate(0,${innerHeight + 44})`}>
                  <rect width={10} height={10} fill={baseColor} rx={2} />
                  <text x={14} y={9} fontSize={10} fill={legendColor}>
                    {baselineLabel}
                  </text>
                  <rect x={baselineLabel.length * 6 + 24} width={10} height={10} fill={curColor} rx={2} />
                  <text x={baselineLabel.length * 6 + 38} y={9} fontSize={10} fill={legendColor}>
                    {currentLabel}
                  </text>
                </g>
              </g>

              {/* tooltip */}
              {tooltip && (
                <g
                  transform={`translate(${tooltip.x},${tooltip.y})`}
                  style={{ pointerEvents: 'none' }}
                >
                  <rect
                    x={-4}
                    y={-44}
                    width={160}
                    height={48}
                    rx={4}
                    fill="var(--popover, #1e293b)"
                    opacity={0.92}
                  />
                  <text x={4} y={-28} fontSize={10} fill="var(--popover-foreground, #f1f5f9)">
                    {tooltip.label}
                  </text>
                  <text x={4} y={-14} fontSize={10} fill={baseColor}>
                    {baselineLabel}: {tooltip.baselineValue?.toLocaleString() ?? '—'}
                  </text>
                  <text x={4} y={0} fontSize={10} fill={curColor}>
                    {currentLabel}: {tooltip.currentValue?.toLocaleString() ?? '—'}
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
