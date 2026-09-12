
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildLighthouseAuditContext } from '@/lib/fixSuggestionContext';
import type { LighthouseAuditRef } from '@/types/report';
import LhDetailsTable from './LhDetailsTable';

export interface LhAuditExpandableProps {
  audit: LighthouseAuditRef;
}

export default function LhAuditExpandable({ audit }: LhAuditExpandableProps) {
  const [open, setOpen] = useState(false);
  const items = audit?.details?.items;
  const headings = audit?.details?.headings;
  const title = audit.title || audit.id;
  const hasTable = Array.isArray(items) && items.length > 0;

  return (
    <li className="border border-md-sys-outline-variant/40 rounded-xl overflow-hidden bg-md-sys-surface-container/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-md-sys-surface-container transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 mt-0.5 text-md-sys-on-surface-variant" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-md-sys-on-surface-variant" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-md-sys-on-surface font-medium">{title}</div>
          <div className="text-[10px] text-md-sys-on-surface-variant font-mono mt-0.5">{audit.id}</div>
          {audit.displayValue && (
            <div className="text-xs text-md-sys-warning font-medium mt-1 font-mono">{audit.displayValue}</div>
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-md-sys-outline-variant/40 space-y-3">
          {audit.description && (
            <p className="text-xs text-md-sys-on-surface-variant whitespace-pre-wrap leading-relaxed">{audit.description}</p>
          )}
          {audit.helpText && (
            <p className="text-xs text-md-sys-on-surface-variant">{audit.helpText}</p>
          )}
          {hasTable && items && <LhDetailsTable headings={headings} items={items} />}
          {!hasTable && <p className="text-xs text-md-sys-on-surface-variant">No detail rows for this audit.</p>}
          <AiSuggestionButton request={buildLighthouseAuditContext(audit)} />
        </div>
      )}
    </li>
  );
}
