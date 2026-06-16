import type { CompactDonutSegment } from './CompactDonut';

export interface CompactStackedBarProps {
  segments: CompactDonutSegment[];
}

export function CompactStackedBar({ segments }: CompactStackedBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 text-[8px] text-muted-foreground sm:text-[9px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.label} ({s.value})
          </span>
        ))}
      </div>
    </div>
  );
}
