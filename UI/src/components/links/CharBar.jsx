export default function CharBar({ len, max, colorFn }) {
  const pct = Math.min(100, (len / max) * 100);
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex-1 bg-track rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${colorFn(len)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{len}/{max}</span>
    </div>
  );
}
