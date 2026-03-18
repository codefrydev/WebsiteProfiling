import { scoreRingColor } from '../../utils/lighthouseUtils';

export default function ScoreRing({ label, score }) {
  const color = scoreRingColor(score);
  const displayScore = score != null ? score : '—';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
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
          <span className="text-xl font-bold text-bright">{displayScore}</span>
        </div>
      </div>
      <span className="text-slate-400 text-xs font-medium mt-2 text-center">{label}</span>
    </div>
  );
}
