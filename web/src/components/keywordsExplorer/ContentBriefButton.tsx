
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
        className="inline-flex items-center gap-1 rounded-md border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/60 px-2 py-1 text-[10px] font-semibold text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:border-accent/40 transition-colors"
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
          <div className="w-full max-w-lg rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container shadow-xl">
            <div className="flex items-center justify-between border-b border-md-sys-outline-variant/40 px-4 py-3">
              <h3 id="content-brief-title" className="text-sm font-semibold text-md-sys-on-surface">
                {s.modalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="press rounded-full p-1.5 text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-high active:scale-[0.98] transition-all"
                aria-label={s.close}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="px-4 py-4 space-y-3 text-sm">
              <p className="font-medium text-md-sys-on-surface">&ldquo;{keyword}&rdquo;</p>
              {loading ? (
                <p className="flex items-center gap-2 text-md-sys-on-surface-variant">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {s.loading}
                </p>
              ) : error ? (
                <p className="text-md-sys-error font-medium text-xs">{error}</p>
              ) : brief && formatBriefSummary(brief.summary) ? (
                <>
                  <pre className="whitespace-pre-wrap text-xs text-md-sys-on-surface-variant leading-relaxed font-sans">
                    {formatBriefSummary(brief.summary)}
                  </pre>
                  {brief.provenance ? (
                    <p className="text-[10px] text-md-sys-on-surface-variant">{s.provenance}: {brief.provenance}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-md-sys-on-surface-variant text-xs">{s.empty}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
