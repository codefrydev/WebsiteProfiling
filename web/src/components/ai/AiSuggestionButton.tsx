'use client';

import { useState, useCallback } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import CopyBtn from '@/components/links/CopyBtn';
import type { FixSuggestionRequest } from '@/types/fixSuggestion';
import { extractFixText, type FixSuggestionResponse } from '@/types/fixSuggestion';

export interface AiSuggestionButtonProps {
  request: FixSuggestionRequest;
  initialText?: string | null;
  className?: string;
}

export default function AiSuggestionButton({ request, initialText = null, className = '' }: AiSuggestionButtonProps) {
  const s = strings.components.aiSuggestion;
  const { readOnly } = useReadOnlySession();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(
    typeof initialText === 'string' && initialText.trim() ? initialText.trim() : null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (readOnly) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/ai/fix-suggestion'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          refresh: !!text,
        }),
      });
      const payload = (await res.json()) as FixSuggestionResponse & { error?: string };
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error || s.failed);
      }
      const fixText = extractFixText(payload) || s.empty;
      setText(fixText);
    } catch (e) {
      setError(e instanceof Error ? e.message : s.failed);
    } finally {
      setLoading(false);
    }
  }, [readOnly, request, text, s.failed, s.empty]);

  return (
    <div className={`space-y-2 ${className}`.trim()}>
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
        <div className="flex items-start gap-2">
          <p className="text-xs text-muted-foreground leading-relaxed flex-1 min-w-0">
            <span className="text-fuchsia-700 dark:text-fuchsia-300 font-semibold">{s.label}: </span>
            {text}
          </p>
          <CopyBtn text={text} className="shrink-0 mt-0.5" />
        </div>
      ) : null}
    </div>
  );
}
