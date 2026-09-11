
import { useState, useCallback } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
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
      const res = await apiFetch(apiUrl('/ai/fix-suggestion'), {
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
          className="inline-flex items-center gap-1.5 rounded-full border border-md-sys-tertiary/30 bg-md-sys-tertiary-container px-3 py-1 text-xs font-medium text-md-sys-on-tertiary-container shadow-elevation-1 hover:shadow-elevation-2 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-3 w-3" aria-hidden />
          )}
          {loading ? s.loading : text ? s.regenerate : s.button}
        </button>
      ) : null}
      {error ? <p className="text-xs text-md-sys-error">{error}</p> : null}
      {text ? (
        <div className="flex items-start gap-2">
          <p className="text-xs text-md-sys-on-surface-variant leading-relaxed flex-1 min-w-0">
            <span className="text-md-sys-tertiary font-semibold">{s.label}: </span>
            {text}
          </p>
          <CopyBtn text={text} className="shrink-0 mt-0.5" />
        </div>
      ) : null}
    </div>
  );
}
