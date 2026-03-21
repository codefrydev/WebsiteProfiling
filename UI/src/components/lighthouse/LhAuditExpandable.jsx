import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import LhDetailsTable from './LhDetailsTable';

export default function LhAuditExpandable({ audit }) {
  const [open, setOpen] = useState(false);
  const items = audit?.details?.items;
  const headings = audit?.details?.headings;
  const title = audit.title || audit.id;
  const hasTable = Array.isArray(items) && items.length > 0;

  return (
    <li className="border border-default rounded-xl overflow-hidden bg-brand-800/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-brand-800 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-200 font-medium">{title}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{audit.id}</div>
          {audit.displayValue && (
            <div className="text-xs text-amber-200/90 mt-1 font-mono">{audit.displayValue}</div>
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-muted space-y-3">
          {audit.description && (
            <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">{audit.description}</p>
          )}
          {audit.helpText && (
            <p className="text-xs text-slate-500">{audit.helpText}</p>
          )}
          {hasTable && <LhDetailsTable headings={headings} items={items} />}
          {!hasTable && <p className="text-xs text-slate-600">No detail rows for this audit.</p>}
        </div>
      )}
    </li>
  );
}
