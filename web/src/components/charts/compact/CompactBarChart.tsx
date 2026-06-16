import type { CSSProperties } from 'react';

export type CompactBarChartVariant = 'default' | 'chubby';

export interface CompactBarChartProps {
  /** Heights as percentages 0–100; length determines bar count */
  heights: number[];
  /** Optional labels rendered under each bar (chubby variant) */
  labels?: string[];
  /** Optional per-bar fill colors (hex or rgb) */
  colors?: string[];
  variant?: CompactBarChartVariant;
  className?: string;
  heightClass?: string;
}

const DEFAULT_BAR =
  'min-w-0 flex-1 rounded-sm bg-gradient-to-t from-blue-600/55 to-blue-400/25';
const CHUBBY_BAR_BASE =
  'w-10 shrink-0 rounded-lg shadow-sm sm:w-12';

function barFillStyle(color: string | undefined, variant: CompactBarChartVariant): CSSProperties {
  if (color) {
    return {
      background: `linear-gradient(to top, ${color}dd, ${color}66)`,
    };
  }
  return {};
}

function barClassName(color: string | undefined, variant: CompactBarChartVariant): string {
  if (variant === 'chubby') {
    return color ? CHUBBY_BAR_BASE : `${CHUBBY_BAR_BASE} bg-gradient-to-t from-blue-600/70 to-blue-400/35`;
  }
  return color ? 'min-w-0 flex-1 rounded-sm' : DEFAULT_BAR;
}

export function CompactBarChart({
  heights,
  labels,
  colors,
  variant = 'default',
  className = '',
  heightClass = 'h-20',
}: CompactBarChartProps) {
  if (!heights.length) return null;

  const minPercent = variant === 'chubby' ? 18 : 4;
  const plotHeightClass = variant === 'chubby' ? 'h-28' : heightClass;

  if (variant === 'chubby') {
    return (
      <div
        className={`rounded-xl border border-default/50 bg-brand-950/35 px-3 py-3 ${className}`.trim()}
        role="img"
        aria-hidden
      >
        <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-4">
          {heights.map((h, i) => {
            const pct = Math.min(100, Math.max(minPercent, h));
            const color = colors?.[i];
            return (
              <div key={labels?.[i] ?? i} className="flex flex-col items-center gap-2">
                <div className={`flex ${plotHeightClass} w-10 items-end sm:w-12`}>
                  <div
                    className={`${barClassName(color, variant)} w-full`}
                    style={{
                      height: `${pct}%`,
                      ...barFillStyle(color, variant),
                    }}
                  />
                </div>
                {labels?.[i] ? (
                  <span className="text-[10px] font-mono font-semibold uppercase text-muted-foreground">
                    {labels[i]}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${heightClass} items-end gap-0.5 rounded-md bg-brand-950/30 px-1 pb-1 pt-2 ${className}`.trim()}
      role="img"
      aria-hidden
    >
      {heights.map((h, i) => {
        const color = colors?.[i];
        return (
          <div
            key={i}
            className={barClassName(color, variant)}
            style={{
              height: `${Math.min(100, Math.max(minPercent, h))}%`,
              ...barFillStyle(color, variant),
            }}
          />
        );
      })}
    </div>
  );
}
