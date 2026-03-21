import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import LhDetailsTable from './LhDetailsTable';

function severityBg(s) {
  if (!s) return 'bg-brand-700 text-foreground';
  const sl = s.toLowerCase();
  if (sl === 'critical') return 'bg-red-500/20 text-red-300';
  if (sl === 'high') return 'bg-orange-500/20 text-orange-300';
  if (sl === 'medium') return 'bg-yellow-500/20 text-yellow-300';
  return 'bg-brand-700/60 text-muted-foreground';
}

export default function DiagnosticItem({ d }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-default rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 bg-brand-800 hover:bg-brand-700 transition-colors text-left"
      >
        <span className={`text-xs px-2 py-0.5 rounded font-semibold shrink-0 mt-0.5 ${severityBg(d.severity)}`}>
          {d.severity || 'Medium'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground font-medium">{d.warning || d.helpText || '—'}</div>
          {d.one_line_fix && (
            <div className="text-xs text-blue-400 mt-0.5 truncate">Fix: {d.one_line_fix}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {d.primary_impact && (
            <span className="text-xs text-muted-foreground hidden sm:block">{d.primary_impact}</span>
          )}
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-3 bg-brand-900 border-t border-muted">
          <div className="bg-brand-900 border border-muted rounded-lg p-3">
            <div className="text-xs text-blue-400 font-bold uppercase mb-1">How to fix</div>
            <p className="text-sm text-foreground">{d.one_line_fix || '—'}</p>
            {d.detailed_fix && (
              <p className="text-xs text-muted-foreground mt-2">{d.detailed_fix}</p>
            )}
          </div>

          {d.estimated_impact && (
            <p className="text-xs text-muted-foreground">Estimated impact: {d.estimated_impact}</p>
          )}

          {Array.isArray(d.evidence) && d.evidence.length > 0 && (
            <div className="text-xs">
              <div className="text-muted-foreground font-semibold mb-1">Evidence:</div>
              <ul className="space-y-1">
                {d.evidence.map((ev, j) => {
                  const isUrl = typeof ev === 'string' && (ev.startsWith('http://') || ev.startsWith('https://'));
                  return (
                    <li key={j} className="text-muted-foreground">
                      {isUrl ? (
                        <a href={ev} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">
                          {ev}
                        </a>
                      ) : (
                        <span className="break-all">{ev}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {d.lighthouse_audit_id && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Audit ID:</span>
              <code className="bg-brand-900 border border-default px-2 py-0.5 rounded font-mono text-foreground">
                {d.lighthouse_audit_id}
              </code>
            </div>
          )}

          {Array.isArray(d.references?.nodes) &&
            d.references.nodes.length > 0 &&
            typeof d.references.nodes[0] === 'object' && (
              <div>
                <div className="text-xs text-muted-foreground font-semibold mb-2">Details</div>
                <LhDetailsTable items={d.references.nodes} />
              </div>
            )}
        </div>
      )}
    </div>
  );
}
