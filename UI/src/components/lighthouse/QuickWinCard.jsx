import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Zap, Image, Code2, Search, Shield, Clock } from 'lucide-react';

const ICON_MAP = { Zap, Image, Code2, Search, Shield, Clock };

function WinIcon({ iconKey }) {
  const Icon = ICON_MAP[iconKey] || Zap;
  return <Icon className="h-4 w-4" />;
}

export default function QuickWinCard({ win, passed }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${
      passed ? 'border-green-700/40 bg-green-500/5' : 'border-amber-700/40 bg-amber-500/5'
    }`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:opacity-90 transition-opacity"
      >
        <div className={`shrink-0 p-2 rounded-lg ${passed ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
          <WinIcon iconKey={win.iconKey} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{win.title}</div>
          <div className={`text-xs mt-0.5 ${passed ? 'text-green-400' : 'text-amber-400'}`}>
            {passed ? 'Passing' : 'Needs attention'}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {passed
            ? <CheckCircle className="h-5 w-5 text-green-400" />
            : <XCircle className="h-5 w-5 text-amber-400" />}
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-muted px-4 py-4 space-y-3 bg-brand-900">
          <div>
            <div className="text-xs text-muted-foreground font-semibold mb-1">Why it matters</div>
            <p className="text-sm text-foreground">{win.why}</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-semibold mb-1">How to fix</div>
            <p className="text-sm text-foreground">{win.how}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Estimated impact:</span>
            <span className="text-xs text-blue-400 font-semibold">{win.impact}</span>
          </div>
        </div>
      )}
    </div>
  );
}
