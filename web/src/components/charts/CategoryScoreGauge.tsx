'use client';

import { format, strings } from '@/lib/strings';
import { scoreBandColor } from '@/utils/chartPalette';

const vo = strings.views.overview;
const sj = strings.common;

export interface CategoryScoreGaugeProps {
  name: string;
  score?: number | null;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function CategoryScoreGauge({ name, score, size = 'md', onClick }: CategoryScoreGaugeProps) {
  const clamped = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const label =
    score == null ? sj.na : score >= 80 ? vo.scoreGood : score >= 50 ? vo.scoreNeeds : vo.scoreCritical;
  const labelCls =
    score == null
      ? 'text-muted-foreground'
      : score >= 80
        ? 'text-green-700 dark:text-green-400'
        : score >= 50
          ? 'text-yellow-700 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-500';
  const color = scoreBandColor(score);
  const isCritical = score != null && score < 50;
  const dim =
    size === 'lg' ? 'w-28 h-28' : size === 'sm' ? 'w-16 h-16' : 'w-20 h-20';
  const textSize = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl';

  const inner = (
    <>
      <div
        className={`${dim} relative shrink-0`}
        aria-label={format(vo.categoryScoreAria, {
          name,
          band: label,
          score: score != null ? score : sj.na,
        })}
      >
        <svg viewBox="0 0 36 36" className={`${dim} -rotate-90`}>
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#1F2937"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={score != null ? `${clamped}, 100` : '0, 100'}
            strokeLinecap="round"
          />
          {isCritical ? (
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.8"
            />
          ) : null}
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center font-bold text-bright ${textSize}`}>
          {score != null ? score : sj.na}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={`font-bold text-foreground ${size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-sm' : 'text-base'}`}>{name}</h3>
        <p className={`mt-0.5 text-xs ${labelCls}`}>{label}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-4 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-default hover:bg-brand-800/30"
      >
        {inner}
      </button>
    );
  }

  return <div className="flex items-center gap-4">{inner}</div>;
}
