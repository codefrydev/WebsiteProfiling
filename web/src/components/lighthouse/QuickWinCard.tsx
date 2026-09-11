
import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Zap, Image, Code2, Search, Shield, Clock, type LucideIcon } from 'lucide-react';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildLighthouseQuickWinContext } from '@/lib/fixSuggestionContext';
import type { LighthouseQuickWin } from '@/types/report';

const ICON_MAP: Record<string, LucideIcon> = { Zap, Image, Code2, Search, Shield, Clock };

export interface QuickWinCardProps {
  win: LighthouseQuickWin;
  passed: boolean;
}

function WinIcon({ iconKey }: { iconKey?: string }) {
  const Icon = (iconKey && ICON_MAP[iconKey]) || Zap;
  return <Icon className="h-4 w-4" />;
}

export default function QuickWinCard({ win, passed }: QuickWinCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
      passed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-md-sys-surface-container-high/40 transition-colors active:scale-[0.99]"
      >
        <div className={`shrink-0 p-2 rounded-full ${passed ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'}`}>
          <WinIcon iconKey={win.iconKey} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-md-sys-on-surface">{win.title}</div>
          <div className={`text-xs mt-0.5 ${passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {passed ? 'Passing' : 'Needs attention'}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {passed
            ? <CheckCircle className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            : <XCircle className="h-5 w-5 text-amber-700 dark:text-amber-400" />}
          {open
            ? <ChevronUp className="h-4 w-4 text-md-sys-on-surface-variant" />
            : <ChevronDown className="h-4 w-4 text-md-sys-on-surface-variant" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-md-sys-outline-variant/30 px-4 py-4 space-y-3 bg-md-sys-surface-container-high/50">
          <div>
            <div className="text-xs text-md-sys-on-surface-variant font-semibold mb-1">Why it matters</div>
            <p className="text-sm text-md-sys-on-surface">{win.why}</p>
          </div>
          <div>
            <div className="text-xs text-md-sys-on-surface-variant font-semibold mb-1">How to fix</div>
            <p className="text-sm text-md-sys-on-surface">{win.how}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-md-sys-on-surface-variant">Estimated impact:</span>
            <span className="text-xs text-md-sys-primary font-semibold">{win.impact}</span>
          </div>
          <AiSuggestionButton request={buildLighthouseQuickWinContext(win, passed)} />
        </div>
      )}
    </div>
  );
}
