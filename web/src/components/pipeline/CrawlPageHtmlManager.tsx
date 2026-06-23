'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings, format } from '@/lib/strings';
import { formatReportGeneratedAt } from '@/lib/reportTimestamps';
import type { CrawlPageHtmlRunRow } from '@/types/report';

const sh = strings.pipelineRunner.storedHtml;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n >= 100 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[i]}`;
}

export interface CrawlPageHtmlManagerProps {
  disabled?: boolean;
}

export default function CrawlPageHtmlManager({ disabled = false }: CrawlPageHtmlManagerProps) {
  const [runs, setRuns] = useState<CrawlPageHtmlRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRunId, setConfirmRunId] = useState<number | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<number | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl('/crawl/page-html?limit=30'));
      const body = (await res.json()) as { runs?: CrawlPageHtmlRunRow[]; error?: string };
      if (!res.ok) {
        setError(body.error || sh.loadFailed);
        setRuns([]);
        return;
      }
      setRuns(Array.isArray(body.runs) ? body.runs : []);
    } catch {
      setError(sh.loadFailed);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const handleDelete = async (crawlRunId: number) => {
    setDeletingRunId(crawlRunId);
    setError(null);
    try {
      const res = await apiFetch(apiUrl('/crawl/page-html'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlRunId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || sh.deleteFailed);
        return;
      }
      setConfirmRunId(null);
      setRuns((prev) =>
        prev.map((row) =>
          row.crawl_run_id === crawlRunId ? { ...row, page_count: 0, total_bytes: 0 } : row,
        ),
      );
    } catch {
      setError(sh.deleteFailed);
    } finally {
      setDeletingRunId(null);
    }
  };

  const storedRuns = runs.filter((r) => r.page_count > 0);

  return (
    <div className="sm:col-span-2 rounded-lg border border-default bg-brand-900/40 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{sh.title}</h4>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{sh.hint}</p>
      </div>

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {sh.loading}
        </div>
      ) : storedRuns.length === 0 ? (
        <p className="text-xs text-muted-foreground">{sh.empty}</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-muted-foreground uppercase tracking-wide border-b border-default/80">
                <th className="text-left py-2 px-2 font-medium">{sh.colRun}</th>
                <th className="text-left py-2 px-2 font-medium">{sh.colSite}</th>
                <th className="text-right py-2 px-2 font-medium">{sh.colPages}</th>
                <th className="text-right py-2 px-2 font-medium">{sh.colSize}</th>
                <th className="text-right py-2 px-2 font-medium w-24">{sh.colAction}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default/60">
              {storedRuns.map((row) => {
                const isConfirm = confirmRunId === row.crawl_run_id;
                const isDeleting = deletingRunId === row.crawl_run_id;
                const createdLabel = row.created_at
                  ? formatReportGeneratedAt(row.created_at)
                  : format(sh.runIdLabel, { id: row.crawl_run_id });
                return (
                  <tr key={row.crawl_run_id}>
                    <td className="py-2 px-2 align-top">
                      <div className="font-mono text-foreground tabular-nums">#{row.crawl_run_id}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{createdLabel}</div>
                      {row.render_mode ? (
                        <div className="text-[10px] text-muted-foreground">{row.render_mode}</div>
                      ) : null}
                    </td>
                    <td className="py-2 px-2 align-top max-w-[200px]">
                      <span className="font-mono text-foreground truncate block" title={row.start_url}>
                        {row.start_url}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-foreground align-top">
                      {row.page_count.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-foreground align-top">
                      {formatBytes(row.total_bytes)}
                    </td>
                    <td className="py-2 px-2 text-right align-top">
                      {isConfirm ? (
                        <div className="space-y-1.5 text-left">
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            {format(sh.deleteConfirm, { id: row.crawl_run_id })}
                          </p>
                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              className="px-1.5 py-0.5 rounded border border-default text-muted-foreground hover:text-foreground"
                              disabled={isDeleting}
                              onClick={() => setConfirmRunId(null)}
                            >
                              {sh.cancel}
                            </button>
                            <button
                              type="button"
                              className="px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                              disabled={isDeleting || disabled}
                              onClick={() => void handleDelete(row.crawl_run_id)}
                            >
                              {isDeleting ? sh.deleting : sh.confirmDelete}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          title={sh.deleteTitle}
                          aria-label={format(sh.deleteTitle, { id: row.crawl_run_id })}
                          disabled={disabled || isDeleting}
                          onClick={() => setConfirmRunId(row.crawl_run_id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{sh.delete}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && storedRuns.length > 0 ? (
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          onClick={() => void loadRuns()}
          disabled={disabled}
        >
          {sh.refresh}
        </button>
      ) : null}
    </div>
  );
}
