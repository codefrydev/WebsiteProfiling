export default function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-brand-800 border border-default rounded-xl p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">{label}</p>
      <p className="text-2xl font-bold text-bright tabular-nums">{value ?? '—'}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}
