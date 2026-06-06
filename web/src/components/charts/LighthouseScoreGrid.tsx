import { ScoreRing } from '@/components/lighthouse';
import { ChartAccessibleFallback } from './ChartAccessibleFallback';

const LH_CAT_ORDER = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

export interface LighthouseScoreGridProps {
  scores: Record<string, number | null | undefined>;
  categoryLabels: Record<string, string>;
  aria: string;
}

/** Lighthouse category scores as ScoreRings (0–100 ratings, not count bars). */
export function LighthouseScoreGrid({ scores, categoryLabels, aria }: LighthouseScoreGridProps) {
  const rows = LH_CAT_ORDER.map((id) => {
    const label = categoryLabels[id] || id.replace('-', ' ');
    const score = scores[id] != null ? Number(scores[id]) : null;
    return [label, score != null ? score : '—'] as [string, string | number];
  });

  return (
    <ChartAccessibleFallback summary={aria} rows={rows}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl" role="presentation">
        {LH_CAT_ORDER.map((id) => {
          const label = categoryLabels[id] || id.replace('-', ' ');
          const score = scores[id] != null ? Number(scores[id]) : null;
          return <ScoreRing key={id} label={label} score={score} />;
        })}
      </div>
    </ChartAccessibleFallback>
  );
}
