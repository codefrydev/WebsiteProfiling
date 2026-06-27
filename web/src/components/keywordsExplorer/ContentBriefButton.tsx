
import { useState, useCallback } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { apiUrl, apiFetch, readApiErrorMessage } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import type { KeywordRow } from '@/types/components';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';

interface ContentBriefResult {
  keyword?: string;
  summary?: string | string[];
  provenance?: string;
}

function formatBriefSummary(summary: string | string[] | undefined): string {
  if (!summary) return '';
  return Array.isArray(summary) ? summary.join('\n') : summary;
}

export interface ContentBriefButtonProps {
  keyword: string;
  clusterRows: KeywordRow[];
}

export default function ContentBriefButton({ keyword, clusterRows }: ContentBriefButtonProps) {
  const s = strings.views.keywordsExplorer.contentBrief;
  const { readOnly } = useReadOnlySession();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<ContentBriefResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = useCallback(async () => {
    if (readOnly) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      const res = await apiFetch(apiUrl('/keywords/content-brief'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          rows: clusterRows.slice(0, 20),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(readApiErrorMessage(payload, res, s.failed));
      const rawBrief = (payload.brief || null) as ContentBriefResult | null;
      setBrief(rawBrief);
    } catch (e) {
      setError(e instanceof Error ? e.message : s.failed);
    } finally {
      setLoading(false);
    }
  }, [keyword, clusterRows, readOnly, s.failed]);

  if (readOnly) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void handleOpen()}
        className="inline-flex items-center gap-1 rounded-md border border-default bg-brand-900/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
        title={s.buttonTitle}
      >
        <FileText className="h-3 w-3 shrink-0" aria-hidden />
        {s.buttonLabel}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="content-brief-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-default bg-brand-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-default px-4 py-3">
              <h3 id="content-brief-title" className="text-sm font-semibold text-bright">
                {s.modalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label={s.close}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="px-4 py-4 space-y-3 text-sm">
              <p className="font-medium text-foreground">&ldquo;{keyword}&rdquo;</p>
              {loading ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {s.loading}
                </p>
              ) : error ? (
                <p className="text-red-700 dark:text-red-400 text-xs">{error}</p>
              ) : formatBriefSummary(brief?.summary) ? (
                <>
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed font-sans">
                    {formatBriefSummary(brief.summary)}
                  </pre>
                  {brief.provenance ? (
                    <p className="text-[10px] text-muted-foreground">{s.provenance}: {brief.provenance}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground text-xs">{s.empty}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
