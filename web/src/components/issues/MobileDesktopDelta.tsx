'use client';

import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Card } from '@/components';
import type { MobileDesktopDeltaRow } from '@/types/report';

interface Props {
  runId: number;
}

const STATUS_CLS = (s: number) =>
  s >= 500
    ? 'text-red-400'
    : s >= 400
      ? 'text-orange-400'
      : s >= 300
        ? 'text-yellow-400'
        : 'text-emerald-400';

function DiffBadge({ label, differs }: { label: string; differs: boolean }) {
  if (!differs) return null;
  return (
    <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-orange-500/15 text-orange-400">
      {label}
    </span>
  );
}

export default function MobileDesktopDelta({ runId }: Props) {
  const [rows, setRows] = useState<MobileDesktopDeltaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    fetch(`/api/report/mobile-delta?id=${runId}`)
      .then((r) => r.json())
      .then((d) => setRows(d.deltas ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading || !rows.length) return null;

  const statusDiffs = rows.filter((r) => r.status_differs).length;
  const titleDiffs = rows.filter((r) => r.title_differs).length;
  const h1Diffs = rows.filter((r) => r.h1_differs).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-blue-400 shrink-0" />
        <h3 className="text-sm font-semibold">Mobile vs Desktop differences</h3>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} URL{rows.length !== 1 ? 's' : ''} differ</span>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {statusDiffs > 0 && (
          <span className="rounded px-2 py-0.5 bg-red-500/15 text-red-400 font-medium">
            {statusDiffs} status change{statusDiffs !== 1 ? 's' : ''}
          </span>
        )}
        {titleDiffs > 0 && (
          <span className="rounded px-2 py-0.5 bg-orange-500/15 text-orange-400 font-medium">
            {titleDiffs} title change{titleDiffs !== 1 ? 's' : ''}
          </span>
        )}
        {h1Diffs > 0 && (
          <span className="rounded px-2 py-0.5 bg-amber-500/15 text-amber-400 font-medium">
            {h1Diffs} H1 change{h1Diffs !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-1.5 pr-3 font-medium">URL</th>
              <th className="pb-1.5 pr-3 font-medium">Difference</th>
              <th className="pb-1.5 pr-3 font-medium">Desktop</th>
              <th className="pb-1.5 font-medium">Mobile</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((row) => {
              const diffs: string[] = [];
              if (row.status_differs) diffs.push('status');
              if (row.title_differs) diffs.push('title');
              if (row.h1_differs) diffs.push('H1');
              if (row.word_count_delta > 50) diffs.push('words');

              return (
                <tr key={row.url} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1.5 pr-3 max-w-[260px]">
                    <span
                      className="block truncate text-muted-foreground"
                      title={row.url}
                    >
                      {row.url}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {diffs.map((d) => (
                        <DiffBadge key={d} label={d} differs />
                      ))}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 max-w-[200px]">
                    {row.status_differs && (
                      <div className={STATUS_CLS(row.desktop.status)}>{row.desktop.status}</div>
                    )}
                    {row.title_differs && (
                      <div className="truncate text-muted-foreground" title={row.desktop.title}>
                        {row.desktop.title || '–'}
                      </div>
                    )}
                    {row.h1_differs && !row.title_differs && (
                      <div className="truncate text-muted-foreground" title={row.desktop.h1}>
                        H1: {row.desktop.h1 || '–'}
                      </div>
                    )}
                    {row.word_count_delta > 50 && !row.title_differs && !row.h1_differs && (
                      <div className="text-muted-foreground">{row.desktop.word_count} words</div>
                    )}
                  </td>
                  <td className="py-1.5 max-w-[200px]">
                    {row.status_differs && (
                      <div className={STATUS_CLS(row.mobile.status)}>{row.mobile.status}</div>
                    )}
                    {row.title_differs && (
                      <div className="truncate text-muted-foreground" title={row.mobile.title}>
                        {row.mobile.title || '–'}
                      </div>
                    )}
                    {row.h1_differs && !row.title_differs && (
                      <div className="truncate text-muted-foreground" title={row.mobile.h1}>
                        H1: {row.mobile.h1 || '–'}
                      </div>
                    )}
                    {row.word_count_delta > 50 && !row.title_differs && !row.h1_differs && (
                      <div className="text-muted-foreground">{row.mobile.word_count} words</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 50 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing top 50 of {rows.length} differing URLs (sorted by severity).
          </p>
        )}
      </div>
    </Card>
  );
}
