
import { useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { getGridColor, getChartTitleColor, getChartLegendLabelColor } from '@/utils/chartJsDefaults';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';
import { ChartPanel } from '../ChartPanel';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';

const MARGIN = { top: 8, right: 12, bottom: 52, left: 46 };
const SVG_HEIGHT = 256;

export interface StackedBarSeries {
  label: string;
  values: number[];
  color: string;
}

export interface D3StackedVerticalBarChartProps {
  labels: string[];
  series: StackedBarSeries[];
  yMax?: number;
  yTitle?: string;
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

/** Vertical stacked bar chart (e.g. 0–100% coverage breakdown). */
export function D3StackedVerticalBarChart({
  labels,
  series,
  yMax = 100,
  yTitle,
  ariaLabel,
  heightClass = 'h-64',
}: D3StackedVerticalBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const rows: Array<[string, string | number]> = labels.flatMap((label, li) =>
    series.map((s) => [`${label} / ${s.label}`, `${Number(s.values[li] ?? 0).toFixed(1)}%`] as [string, string | number]),
  );

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = scaleBand().domain(labels).range([0, innerWidth]).padding(0.35);
  const yScale = scaleLinear().domain([0, yMax]).range([innerHeight, 0]).nice();

  const yTicks = yScale.ticks(5);
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
              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
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
                    {tick}
                  </text>
                ))}

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

                {labels.map((label, li) => {
                  const barX = xScale(label) ?? 0;
                  const barWidth = xScale.bandwidth();
                  let stackBase = 0;

                  return (
                    <g key={label} transform={`translate(${barX},0)`}>
                      {series.map((s) => {
                        const value = s.values[li] ?? 0;
                        const segTop = yScale(stackBase + value);
                        const segBottom = yScale(stackBase);
                        const segHeight = Math.max(0, segBottom - segTop);
                        const y = segTop;
                        stackBase += value;

                        return (
                          <rect
                            key={s.label}
                            x={0}
                            y={y}
                            width={barWidth}
                            height={segHeight}
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
                    </g>
                  );
                })}

                {labels.map((label) => {
                  const cx = (xScale(label) ?? 0) + xScale.bandwidth() / 2;
                  return (
                    <text
                      key={label}
                      x={cx}
                      y={innerHeight + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={titleColor}
                    >
                      {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                    </text>
                  );
                })}

                <line
                  x1={0}
                  x2={innerWidth}
                  y1={innerHeight}
                  y2={innerHeight}
                  stroke={gridColor}
                  strokeWidth={1}
                />

                {series.map((s, si) => {
                  const legendX = si * Math.min(innerWidth / series.length, 160);
                  return (
                    <g key={s.label} transform={`translate(${legendX},${innerHeight + 28})`}>
                      <rect width={10} height={10} fill={s.color} rx={2} />
                      <text x={14} y={9} fontSize={10} fill={legendColor}>
                        {s.label}
                      </text>
                    </g>
                  );
                })}
              </g>

              {tooltip && (
                <g
                  transform={`translate(${tooltip.x},${tooltip.y})`}
                  style={{ pointerEvents: 'none' }}
                >
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
