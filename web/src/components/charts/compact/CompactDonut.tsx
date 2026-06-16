export interface CompactDonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface CompactDonutProps {
  segments: CompactDonutSegment[];
  centerLabel?: string;
  centerValue?: string;
  /** When true, legend shows raw counts; otherwise percentages of total */
  showCounts?: boolean;
  /** Tailwind size classes for the donut ring (default compact h-14 w-14) */
  ringClassName?: string;
}

export function CompactDonut({
  segments,
  centerLabel,
  centerValue,
  showCounts = false,
  ringClassName = 'h-14 w-14',
}: CompactDonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  let cumulative = 0;
  const gradient = segments
    .map((s) => {
      const start = (cumulative / total) * 100;
      cumulative += s.value;
      const end = (cumulative / total) * 100;
      return `${s.color} ${start}% ${end}%`;
    })
    .join(', ');

  return (
    <div className="flex items-center gap-2">
      <div className={`relative shrink-0 ${ringClassName}`.trim()}>
        <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-brand-900/95">
          {centerValue ? (
            <span className="text-[10px] font-bold tabular-nums text-bright">{centerValue}</span>
          ) : null}
          {centerLabel ? (
            <span className="text-[7px] uppercase text-muted-foreground">{centerLabel}</span>
          ) : null}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {segments.map((s) => {
          const pct = Math.round((s.value / total) * 100);
          return (
            <li key={s.label} className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px]">
              <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {showCounts ? s.value.toLocaleString() : `${pct}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
