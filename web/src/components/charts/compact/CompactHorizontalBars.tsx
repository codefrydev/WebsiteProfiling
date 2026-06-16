export interface CompactHorizontalBarItem {
  label: string;
  value: number;
  color: string;
}

export interface CompactHorizontalBarsProps {
  items: CompactHorizontalBarItem[];
}

export function CompactHorizontalBars({ items }: CompactHorizontalBarsProps) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.value));

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-0.5 flex justify-between text-[9px] sm:text-[10px]">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{item.value.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-brand-700/60">
            <div
              className="h-full rounded-full"
              style={{
                width: `${max > 0 ? (item.value / max) * 100 : 0}%`,
                background: item.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
