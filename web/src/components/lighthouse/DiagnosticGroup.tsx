import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { LighthouseDiagnostic, LighthouseImpactGroup } from '@/types/report';
import DiagnosticItem from './DiagnosticItem';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;

export interface DiagnosticGroupProps {
  group: LighthouseImpactGroup;
  items: LighthouseDiagnostic[];
  defaultOpen?: boolean;
}

function severityDot(s: string): string {
  if (s === 'critical' || s === 'high') return 'bg-red-500';
  if (s === 'medium') return 'bg-yellow-500';
  return 'bg-brand-700';
}

export default function DiagnosticGroup({ group, items, defaultOpen = false }: DiagnosticGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  const maxSeverity = useMemo(() => {
    const all = items.map((d) => (d.severity || 'low').toLowerCase());
    return SEVERITY_ORDER.find((s) => all.includes(s)) || 'low';
  }, [items]);

  return (
    <div className={`border rounded-xl overflow-hidden ${group.border} opacity-80`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-brand-800 hover:bg-brand-700 transition-colors text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${severityDot(maxSeverity)}`} />
        <span className={`text-sm font-semibold ${group.color}`}>{group.label}</span>
        <span className="text-xs bg-brand-700/60 text-muted-foreground px-2 py-0.5 rounded-full">
          {items.length} issue{items.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
          <div className="divide-y divide-muted p-3 space-y-2 bg-brand-900">
          {items.map((d, i) => <DiagnosticItem key={i} d={d} />)}
        </div>
      )}
    </div>
  );
}
