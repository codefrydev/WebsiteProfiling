'use client';

import { useState, useCallback } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import type { ReportIssue } from '@/types';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';

export interface IssueAiFixButtonProps {
  issue: ReportIssue;
  category: string;
}

export default function IssueAiFixButton({ issue, category }: IssueAiFixButtonProps) {
  const s = strings.views.issues.aiFix;
  const { readOnly } = useReadOnlySession();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(
    typeof issue.llm_recommendation === 'string' ? issue.llm_recommendation : null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (readOnly) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/issues/fix-suggestion'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: issue.message,
          url: issue.url,
          priority: issue.priority,
          category,
          recommendation: issue.recommendation,
          type: issue.type || issue.finding_type,
          refresh: !!text,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || s.failed);
      const fix = payload.fix as { fix?: string } | undefined;
      setText(String(fix?.fix || payload.fix || '').trim() || s.empty);
    } catch (e) {
      setError(e instanceof Error ? e.message : s.failed);
    } finally {
      setLoading(false);
    }
  }, [issue, category, text, readOnly, s.failed, s.empty]);

  return (
    <div className="space-y-2">
      {!readOnly ? (
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-800 dark:text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-3 w-3" aria-hidden />
        )}
        {loading ? s.loading : text ? s.regenerate : s.button}
      </button>
      ) : null}
      {error ? <p className="text-xs text-red-700 dark:text-red-400">{error}</p> : null}
      {text ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-fuchsia-700 dark:text-fuchsia-300 font-semibold">{s.label}: </span>
          {text}
        </p>
      ) : null}
    </div>
  );
}
