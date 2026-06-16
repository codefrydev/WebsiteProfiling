export interface CompactKpiProps {
  label: string;
  value: string;
  accent?: boolean;
  delta?: string;
  deltaClassName?: string;
}

export function CompactKpi({
  label,
  value,
  accent,
  delta,
  deltaClassName = 'text-emerald-400',
}: CompactKpiProps) {
  return (
    <div className="rounded-lg border border-default/80 bg-brand-900/50 px-2.5 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <div className="mt-0.5 flex items-end justify-between gap-1">
        <p className={`text-sm font-bold tabular-nums ${accent ? 'text-link' : 'text-bright'}`}>{value}</p>
        {delta ? <span className={`text-[9px] font-medium ${deltaClassName}`}>{delta}</span> : null}
      </div>
    </div>
  );
}
