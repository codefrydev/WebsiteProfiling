export default function MiniBar({ value, total, color = 'bg-blue-500', label }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>}
      <div className="flex-1 bg-track rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}
