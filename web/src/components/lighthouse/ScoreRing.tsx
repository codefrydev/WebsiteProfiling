import { scoreRingColor } from '../../utils/lighthouseUtils';

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

export default function ScoreRing({ label, score, size = 'md' }: ScoreRingProps) {
  const color = scoreRingColor(score);
  const displayScore = score != null ? score : '—';
  const cls = SIZE_CLASSES[size];

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${cls.ring}`}>
        <svg viewBox="0 0 36 36" className={`${cls.ring} -rotate-90`}>
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="rgb(51, 65, 85)"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={score != null ? `${score}, 100` : '0, 100'}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold tabular-nums text-bright ${cls.score}`}>{displayScore}</span>
        </div>
      </div>
      <span className={`font-medium text-center text-muted-foreground ${cls.label}`}>{label}</span>
    </div>
  );
}
