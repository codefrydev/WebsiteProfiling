import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function SecHeaderRow({ label, value, recommendation }) {
  const [open, setOpen] = useState(false);
  const present = !!value;

  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-brand-800 hover:bg-brand-700 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {present
            ? <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
            : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
          <span className="text-sm font-mono text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {present
            ? <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">Present</span>
            : <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">Missing</span>}
          {open
            ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 bg-brand-900 space-y-2 border-t border-muted">
          {present
            ? <p className="text-xs font-mono text-foreground break-all">{value}</p>
            : <p className="text-xs text-muted-foreground">Header not set on this page.</p>}
          {recommendation && (
            <p className="text-xs text-blue-400">
              <span className="text-muted-foreground">Recommendation:</span> {recommendation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
