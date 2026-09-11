
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildLighthouseDiagnosticContext } from '@/lib/fixSuggestionContext';
import type { LighthouseDiagnostic } from '@/types/report';
import LhDetailsTable from './LhDetailsTable';

function severityBg(s: string | undefined): string {
  if (!s) return 'bg-md-sys-surface-container-high text-md-sys-on-surface';
  const sl = s.toLowerCase();
  if (sl === 'critical') return 'bg-red-500/20 text-red-800 dark:text-red-300';
  if (sl === 'high') return 'bg-orange-500/20 text-orange-800 dark:text-orange-300';
  if (sl === 'medium') return 'bg-yellow-500/20 text-yellow-900 dark:text-yellow-300';
  return 'bg-md-sys-surface-container-high/60 text-md-sys-on-surface-variant';
}

export interface DiagnosticItemProps {
  d: LighthouseDiagnostic;
}

export default function DiagnosticItem({ d }: DiagnosticItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-md-sys-outline-variant/40 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 bg-md-sys-surface-container hover:bg-md-sys-surface-container-high transition-colors text-left"
      >
        <span className={`text-xs px-2 py-0.5 rounded font-semibold shrink-0 mt-0.5 ${severityBg(d.severity)}`}>
          {d.severity || 'Medium'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-md-sys-on-surface font-medium">{d.warning || d.helpText || '—'}</div>
          {d.one_line_fix && (
            <div className="text-xs text-md-sys-primary mt-0.5 truncate">Fix: {d.one_line_fix}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {d.primary_impact && (
            <span className="text-xs text-md-sys-on-surface-variant hidden sm:block">{d.primary_impact}</span>
          )}
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-md-sys-on-surface-variant" />
            : <ChevronDown className="h-3.5 w-3.5 text-md-sys-on-surface-variant" />}
        </div>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-3 bg-md-sys-surface-container-low border-t border-md-sys-outline-variant/40">
          <div className="bg-md-sys-surface-container-low border border-md-sys-outline-variant/40 rounded-lg p-3">
            <div className="text-xs text-md-sys-primary font-bold uppercase mb-1">How to fix</div>
            <p className="text-sm text-md-sys-on-surface">{d.one_line_fix || '—'}</p>
            {d.detailed_fix && (
              <p className="text-xs text-md-sys-on-surface-variant mt-2">{d.detailed_fix}</p>
            )}
            <AiSuggestionButton request={buildLighthouseDiagnosticContext(d)} className="mt-3" />
          </div>

          {d.estimated_impact && (
            <p className="text-xs text-md-sys-on-surface-variant">Estimated impact: {d.estimated_impact}</p>
          )}

          {Array.isArray(d.evidence) && d.evidence.length > 0 && (
            <div className="text-xs">
              <div className="text-md-sys-on-surface-variant font-semibold mb-1">Evidence:</div>
              <ul className="space-y-1">
                {d.evidence.map((ev, j) => {
                  const isUrl = typeof ev === 'string' && (ev.startsWith('http://') || ev.startsWith('https://'));
                  return (
                    <li key={j} className="text-md-sys-on-surface-variant">
                      {isUrl ? (
                        <a href={ev} target="_blank" rel="noreferrer" className="text-md-sys-primary hover:underline break-all">
                          {ev}
                        </a>
                      ) : (
                        <span className="break-all">{String(ev)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {d.lighthouse_audit_id && (
            <div className="flex items-center gap-2 text-xs text-md-sys-on-surface-variant">
              <span>Audit ID:</span>
              <code className="bg-md-sys-surface-container-low border border-md-sys-outline-variant/40 px-2 py-0.5 rounded font-mono text-md-sys-on-surface">
                {d.lighthouse_audit_id}
              </code>
            </div>
          )}

          {Array.isArray(d.references?.nodes) &&
            d.references.nodes.length > 0 &&
            typeof d.references.nodes[0] === 'object' && (
              <div>
                <div className="text-xs text-md-sys-on-surface-variant font-semibold mb-2">Details</div>
                <LhDetailsTable items={d.references.nodes} />
              </div>
            )}
        </div>
      )}
    </div>
  );
}
