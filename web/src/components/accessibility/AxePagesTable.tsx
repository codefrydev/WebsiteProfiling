import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { format, strings } from '@/lib/strings';
import { normalizeAxeImpactForBadge } from '@/lib/axeViolations';
import type { FlatAxePageRow } from '@/lib/axeViolations';
import { severityBg } from '@/utils/linkUtils';
import GoogleTableToolbar from '@/components/google/GoogleTableToolbar';
import { Button } from '@/components';
import { paginateSlice, PAGE_SIZE, exportCsv } from '@/components/google/tableUtils';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import type { PaginationLabels } from '@/types/components';

interface AxePagesTableProps {
  rows: FlatAxePageRow[];
  searchQuery?: string;
  ruleFilter?: string | null;
  paginationLabels?: PaginationLabels;
  devData?: unknown;
}

export default function AxePagesTable({
  rows,
  searchQuery = '',
  ruleFilter = null,
  paginationLabels,
  devData,
}: AxePagesTableProps) {
  const va = strings.views.accessibility;
  const pl = paginationLabels ?? va.table;
  const [localSearch, setLocalSearch] = useState('');
  const [sortKey, setSortKey] = useState<'url' | 'violationCount'>('violationCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const parts = [searchQuery, localSearch]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    let out = rows;
    if (ruleFilter) {
      const rule = ruleFilter.trim().toLowerCase();
      out = out.filter((row) =>
        row.violations.some((v) => String(v.id ?? '').toLowerCase() === rule),
      );
    }
    if (parts.length) {
      out = out.filter((row) => {
        const hay = [row.url, row.title, ...row.violations.map((v) => v.id || ''), ...row.violations.map((v) => v.description || '')]
          .join(' ')
          .toLowerCase();
        return parts.every((q) => hay.includes(q));
      });
    }
    return out;
  }, [localSearch, rows, ruleFilter, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === 'violationCount') {
        return sortDir === 'asc'
          ? a.violationCount - b.violationCount
          : b.violationCount - a.violationCount;
      }
      return sortDir === 'asc' ? a.url.localeCompare(b.url) : b.url.localeCompare(a.url);
    });
  }, [filtered, sortDir, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [localSearch, searchQuery, ruleFilter, sortKey, sortDir]);

  const pagination = useMemo(
    () => paginateSlice(sorted, page, PAGE_SIZE),
    [page, sorted],
  );

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), pagination.totalPages));
  }, [pagination.totalPages]);

  const toggleSort = (key: 'url' | 'violationCount') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'violationCount' ? 'desc' : 'asc');
    }
  };

  const exportRows = sorted.map((row) => ({
    url: row.url,
    title: row.title,
    violationCount: row.violationCount,
    rules: row.violations.map((v) => v.id).filter(Boolean).join('; '),
  }));

  return (
    <div className={devData != null ? 'relative group/dev-card' : undefined}>
      {devData != null ? <DevCopyJsonButton data={devData} /> : null}
      <GoogleTableToolbar
        search={localSearch}
        onSearch={setLocalSearch}
        searchPlaceholder={va.searchPlaceholder}
        onExport={() =>
          exportCsv(
            exportRows,
            [
              { key: 'url', label: va.colUrl },
              { key: 'title', label: 'Title' },
              { key: 'violationCount', label: va.colCount },
              { key: 'rules', label: va.statRules },
            ],
            'axe-pages.csv',
          )
        }
        exportLabel={va.exportCsv}
      />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default">
              <th className="w-8 px-3 py-2" aria-hidden />
              <th
                className="px-3 py-2 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort('url')}
                aria-sort={sortKey === 'url' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {va.colUrl}
                {sortKey === 'url' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
              </th>
              <th
                className="px-3 py-2 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                onClick={() => toggleSort('violationCount')}
                aria-sort={
                  sortKey === 'violationCount' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
              >
                {va.colCount}
                {sortKey === 'violationCount' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.slice.map((row) => {
              const open = expanded === row.id;
              return (
                <Fragment key={row.id}>
                  <tr className="border-b border-default/50 hover:bg-brand-800/60 transition-colors">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : row.id)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        aria-expanded={open}
                        aria-label={open ? 'Collapse violations' : 'Expand violations'}
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-mono text-xs break-all">{row.url}</span>
                        <UrlInspectorButton url={row.url} />
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.violationCount}</td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-muted/60 bg-brand-900/50">
                      <td colSpan={3} className="px-4 py-3">
                        <ul className="space-y-2 py-2">
                          {row.violations.map((v, i) => (
                            <li key={`${v.id}-${i}`} className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                              <span className="font-mono text-foreground">{v.id}</span>
                              {v.impact ? (
                                <span
                                  className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${severityBg(normalizeAxeImpactForBadge(v.impact))}`}
                                >
                                  {v.impact}
                                </span>
                              ) : null}
                              {v.description ? <span>— {v.description}</span> : null}
                              {v.nodes != null ? (
                                <span>
                                  ({v.nodes} {va.nodesLabel})
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {pagination.slice.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  {va.noViolations}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pagination.total > 0 ? (
        <div className="mt-3 pt-3 border-t border-default flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center px-1">
          <div className="text-sm text-muted-foreground space-y-0.5">
            <div>{format(pl.showingSlice, { from: pagination.from, to: pagination.to, total: pagination.total })}</div>
            <div className="text-xs">
              {pl.pageOf}{' '}
              <span className="font-bold text-bright tabular-nums">{pagination.page}</span> {pl.of}{' '}
              <span className="font-bold text-bright tabular-nums">{pagination.totalPages}</span>
              <span className="text-muted-foreground ml-2">
                ({format(pl.rowsPerPage, { n: PAGE_SIZE })})
              </span>
            </div>
          </div>
          {pagination.totalPages > 1 ? (
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
              >
                {pl.previous}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
              >
                {pl.next}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
