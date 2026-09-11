
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
    <div className="sm:col-span-2 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-md-sys-on-surface">{sh.title}</h4>
        <p className="mt-1 text-xs text-md-sys-on-surface-variant leading-relaxed">{sh.hint}</p>
      </div>

      {error ? (
        <p className="text-xs text-md-sys-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-md-sys-on-surface-variant">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {sh.loading}
        </div>
      ) : storedRuns.length === 0 ? (
        <p className="text-xs text-md-sys-on-surface-variant">{sh.empty}</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-md-sys-on-surface-variant uppercase tracking-wide border-b border-md-sys-outline-variant/50">
                <th className="text-left py-2 px-2 font-medium">{sh.colRun}</th>
                <th className="text-left py-2 px-2 font-medium">{sh.colSite}</th>
                <th className="text-right py-2 px-2 font-medium">{sh.colPages}</th>
                <th className="text-right py-2 px-2 font-medium">{sh.colSize}</th>
                <th className="text-right py-2 px-2 font-medium w-24">{sh.colAction}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-md-sys-outline-variant/30/60">
              {storedRuns.map((row) => {
                const isConfirm = confirmRunId === row.crawl_run_id;
                const isDeleting = deletingRunId === row.crawl_run_id;
                const createdLabel = row.created_at
                  ? formatReportGeneratedAt(row.created_at)
                  : format(sh.runIdLabel, { id: row.crawl_run_id });
                return (
                  <tr key={row.crawl_run_id}>
                    <td className="py-2 px-2 align-top">
                      <div className="font-mono text-md-sys-on-surface tabular-nums">#{row.crawl_run_id}</div>
                      <div className="text-[10px] text-md-sys-on-surface-variant mt-0.5">{createdLabel}</div>
                      {row.render_mode ? (
                        <div className="text-[10px] text-md-sys-on-surface-variant">{row.render_mode}</div>
                      ) : null}
                    </td>
                    <td className="py-2 px-2 align-top max-w-[200px]">
                      <span className="font-mono text-md-sys-on-surface truncate block" title={row.start_url}>
                        {row.start_url}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-md-sys-on-surface align-top">
                      {row.page_count.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-md-sys-on-surface align-top">
                      {formatBytes(row.total_bytes)}
                    </td>
                    <td className="py-2 px-2 text-right align-top">
                      {isConfirm ? (
                        <div className="space-y-1.5 text-left">
                          <p className="text-[10px] text-md-sys-on-surface-variant leading-snug">
                            {format(sh.deleteConfirm, { id: row.crawl_run_id })}
                          </p>
                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              className="press px-2 py-0.5 rounded-full border border-md-sys-outline-variant/40 text-md-sys-on-surface-variant hover:text-md-sys-on-surface text-xs transition-all active:scale-[0.98]"
                              disabled={isDeleting}
                              onClick={() => setConfirmRunId(null)}
                            >
                              {sh.cancel}
                            </button>
                            <button
                              type="button"
                              className="press px-2 py-0.5 rounded-full bg-md-sys-error text-md-sys-on-error hover:opacity-90 disabled:opacity-60 text-xs font-medium transition-all active:scale-[0.98]"
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
                          className="press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-md-sys-on-surface-variant hover:text-md-sys-error hover:bg-md-sys-error/10 disabled:opacity-50 transition-all active:scale-[0.98]"
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
          className="text-[11px] text-md-sys-on-surface-variant hover:text-md-sys-on-surface underline-offset-2 hover:underline"
          onClick={() => void loadRuns()}
          disabled={disabled}
        >
          {sh.refresh}
        </button>
      ) : null}
    </div>
  );
}
