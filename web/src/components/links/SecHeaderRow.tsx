
import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildSecurityHeaderContext } from '@/lib/fixSuggestionContext';

export interface SecHeaderRowProps {
  label: string;
  value?: string | null;
  recommendation?: string;
  pageUrl?: string;
}

export default function SecHeaderRow({ label, value, recommendation, pageUrl }: SecHeaderRowProps) {
  const [open, setOpen] = useState(false);
  const present = !!value;

  return (
    <div className="border border-md-sys-outline-variant/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-md-sys-surface-container hover:bg-md-sys-surface-container-high transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {present
            ? <CheckCircle className="h-4 w-4 text-md-sys-success shrink-0" />
            : <XCircle className="h-4 w-4 text-md-sys-error shrink-0" />}
          <span className="text-sm font-mono text-md-sys-on-surface">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {present
            ? <span className="text-xs text-md-sys-success bg-md-sys-success-container/20 border border-md-sys-success/30 px-2 py-0.5 rounded-full font-medium">Present</span>
            : <span className="text-xs text-md-sys-error bg-md-sys-error-container/20 border border-md-sys-error/30 px-2 py-0.5 rounded-full font-medium">Missing</span>}
          {open
            ? <ChevronUp className="h-3 w-3 text-md-sys-on-surface-variant" />
            : <ChevronDown className="h-3 w-3 text-md-sys-on-surface-variant" />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 bg-md-sys-surface-container-low space-y-2 border-t border-md-sys-outline-variant/40">
          {present
            ? <p className="text-xs font-mono text-md-sys-on-surface break-all">{value}</p>
            : <p className="text-xs text-md-sys-on-surface-variant">Header not set on this page.</p>}
          {recommendation && (
            <p className="text-xs text-md-sys-primary">
              <span className="text-md-sys-on-surface-variant">Recommendation:</span> {recommendation}
            </p>
          )}
          {!present ? (
            <AiSuggestionButton request={buildSecurityHeaderContext(label, pageUrl)} />
          ) : null}
        </div>
      )}
    </div>
  );
}
