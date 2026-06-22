'use client';

import type { QueryResult } from '@/lib/dashboard/engine/types';
import type { VizOptions } from '@/lib/dashboard/engine/doc';

interface TableWidgetProps {
  result: QueryResult;
  options?: VizOptions;
}

function cell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

export function TableWidget({ result, options }: TableWidgetProps) {
  const rows = result.table.slice(0, options?.tableLimit ?? 50);
  if (!rows.length) {
    return <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No rows</div>;
  }
  const cols = Object.keys(rows[0]);
  return (
    <div className="h-full overflow-auto text-xs">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-brand-900/95 backdrop-blur">
          <tr className="text-left text-muted-foreground">
            {cols.map((c) => (
              <th key={c} className="px-2 py-1 font-semibold border-b border-default whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/5">
              {cols.map((c) => (
                <td key={c} className="px-2 py-1 border-b border-default/40 truncate max-w-[260px]" title={cell(r[c])}>
                  {cell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
