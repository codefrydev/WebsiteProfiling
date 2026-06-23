
import { format, strings } from '@/lib/strings';
import { scoreBandColor } from '@/utils/chartPalette';
import { buildCriticalOverlayPath, buildScoreArcPaths } from '@/lib/viz/arcGauge';

const vo = strings.views.overview;
const sj = strings.common;

const INNER_R = 13.5;
const OUTER_R = 15.9155;
const CX = 18;
const CY = 18;

export interface CategoryScoreGaugeProps {
  name: string;
  score?: number | null;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function CategoryScoreGauge({ name, score, size = 'md', onClick }: CategoryScoreGaugeProps) {
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

  const { background, foreground } = buildScoreArcPaths(score, INNER_R, OUTER_R);
  const criticalOverlay = isCritical ? buildCriticalOverlayPath(INNER_R, OUTER_R) : null;

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
        <svg viewBox="0 0 36 36" className={dim} aria-hidden="true">
          <g transform={`translate(${CX},${CY})`}>
            <path d={background} fill="#1F2937" />
            {foreground ? <path d={foreground} fill={color} /> : null}
            {criticalOverlay ? (
              <path
                d={criticalOverlay}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.8}
              />
            ) : null}
          </g>
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
