
import {
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
} from '@/components';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

/** Render any cell value as readable text; collapse arrays/objects instead of "[object Object]". */
function formatCell(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : '—';
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  }
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

export function TableViz({ data, opts }: VizRenderProps) {
  const limit = opts.tableLimit ?? 50;
  const capped = data.rows.slice(0, limit);
  if (!capped.length) return <EmptyData />;

  // Union of keys across all rows (rows can be heterogeneous), preserving first-seen order.
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of capped) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) { seen.add(key); cols.push(key); }
    }
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <Table>
        <TableHead>
          <tr>
            {cols.map((c) => <TableHeadCell key={c}>{c}</TableHeadCell>)}
          </tr>
        </TableHead>
        <TableBody>
          {capped.map((row, i) => (
            <TableRow key={i}>
              {cols.map((c) => (
                <TableCell key={c}>{formatCell(row[c])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
