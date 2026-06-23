
import { useState, useMemo, useEffect } from 'react';
import { format } from '../../lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import HelpHint, { normalizeHintContent } from '../HelpHint';
import { Button } from '../index';
import { PAGE_SIZE, paginateSlice } from './tableUtils';
import type { PaginationLabels, TableColumn } from '@/types/components';

interface SortablePaginatedTableProps {
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
  defaultSort?: string;
  defaultDir?: 'asc' | 'desc';
  rowKeyField?: string;
  emptyMessage?: React.ReactNode;
  paginationLabels: PaginationLabels;
}

export default function SortablePaginatedTable({
  columns,
  rows,
  defaultSort,
  defaultDir = 'desc',
  rowKeyField,
  emptyMessage,
  paginationLabels: pl,
}: SortablePaginatedTableProps) {
  const [sortKey, setSortKey] = useState(defaultSort || columns[0]?.key);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rows, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [rows, sortKey, sortDir]);

  const { slice: visible, page: safePage, totalPages, total, from, to } = useMemo(
    () => paginateSlice(sorted, page, PAGE_SIZE),
    [sorted, page],
  );

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const toggle = (key: string): void => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default">
              {columns.map((col) => {
                const hintContent = normalizeHintContent(
                  col.hint == null
                    ? undefined
                    : typeof col.hint === 'string'
                      ? metricHelpHint(col.hint)
                      : col.hint,
                );
                return (
                <th
                  key={col.key}
                  onClick={() => toggle(col.key)}
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="px-3 py-2 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1 normal-case">
                    {col.label}
                    {hintContent ? (
                      <span
                        className="inline-flex"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <HelpHint title={hintContent.title} ariaLabel={`About ${col.label}`}>
                          {hintContent.body}
                        </HelpHint>
                      </span>
                    ) : null}
                  </span>
                  {sortKey === col.key && (
                    <span className="ml-1" aria-hidden>
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                  {sortKey === col.key ? (
                    <span className="sr-only">
                      {sortDir === 'asc' ? 'sorted ascending' : 'sorted descending'}
                    </span>
                  ) : null}
                </th>
              );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row: Record<string, unknown>, i: number) => (
              <tr
                key={rowKeyField && row[rowKeyField] ? String(row[rowKeyField]) : `row-${safePage}-${i}`}
                className="border-b border-default/50 hover:bg-brand-800/60 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-foreground">
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <div className="mt-3 pt-3 border-t border-default flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div className="text-sm text-muted-foreground space-y-0.5">
            <div>{format(pl.showingSlice, { from, to, total })}</div>
            <div className="text-xs">
              {pl.pageOf}{' '}
              <span className="font-bold text-bright tabular-nums">{safePage}</span> {pl.of}{' '}
              <span className="font-bold text-bright tabular-nums">{totalPages}</span>
              <span className="text-muted-foreground ml-2">
                ({format(pl.rowsPerPage, { n: PAGE_SIZE })})
              </span>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
              >
                {pl.previous}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
              >
                {pl.next}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
