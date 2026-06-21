import { scoreRingColor } from '../../utils/lighthouseUtils';
import { buildScoreArcPaths } from '@/lib/viz/arcGauge';

export type ScoreRingSize = 'sm' | 'md' | 'lg';

export interface ScoreRingProps {
  label: string;
  score: number | null | undefined;
  size?: ScoreRingSize;
}

const SIZE_CLASSES: Record<ScoreRingSize, { ring: string; score: string; label: string }> = {
  sm: { ring: 'h-12 w-12', score: 'text-[11px]', label: 'text-[8px] mt-1' },
  md: { ring: 'h-24 w-24', score: 'text-xl', label: 'text-xs mt-2' },
  lg: { ring: 'h-28 w-28', score: 'text-3xl', label: 'text-sm mt-2' },
};

const INNER_R = 13.5;
const OUTER_R = 15.9155;
const CX = 18;
const CY = 18;

export default function ScoreRing({ label, score, size = 'md' }: ScoreRingProps) {
  const color = scoreRingColor(score);
  const displayScore = score != null ? score : '—';
  const cls = SIZE_CLASSES[size];
  const { background, foreground } = buildScoreArcPaths(score, INNER_R, OUTER_R);

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${cls.ring}`}>
        <svg viewBox="0 0 36 36" className={cls.ring} aria-hidden="true">
          <g transform={`translate(${CX},${CY})`}>
            <path d={background} fill="rgb(51, 65, 85)" />
            {foreground ? <path d={foreground} fill={color} /> : null}
          </g>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold tabular-nums text-bright ${cls.score}`}>{displayScore}</span>
        </div>
      </div>
      <span className={`font-medium text-center text-muted-foreground ${cls.label}`}>{label}</span>
    </div>
  );
}
