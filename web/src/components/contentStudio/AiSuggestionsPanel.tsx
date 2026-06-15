'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { strings } from '@/lib/strings';
import type { ContentAnalyzeResult } from '@/types/contentStudio';

interface AiSuggestionsPanelProps {
  analysis: ContentAnalyzeResult | null;
  loading: boolean;
  error: string | null;
  visible: boolean;
}

function priorityClass(p: string): string {
  const v = p.toLowerCase();
  if (v === 'high') return 'border-l-red-500/60';
  if (v === 'low') return 'border-l-muted-foreground/40';
  return 'border-l-amber-500/60';
}

export default function AiSuggestionsPanel({
  analysis,
  loading,
  error,
  visible,
}: AiSuggestionsPanelProps) {
  const s = strings.views.contentStudio.ai;

  if (!visible) {
    return (
      <div className="rounded-lg border border-dashed border-default bg-brand-900/30 p-3 text-xs text-muted-foreground">
        {s.disabledHint}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {s.analyzing}
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-700 dark:text-red-400">{error}</p>;
  }

  if (!analysis) {
    return (
      <p className="text-xs text-muted-foreground">{s.clickAnalyze}</p>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {s.title}
      </div>
      {analysis.summary ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{analysis.summary}</p>
      ) : null}
      {analysis.provenance ? (
        <p className="text-[10px] text-muted-foreground/80">{analysis.provenance}</p>
      ) : null}
      {analysis.tools_used && analysis.tools_used.length > 0 ? (
        <p className="text-[10px] text-muted-foreground/80">
          {s.toolsUsed}: {analysis.tools_used.join(' → ')}
        </p>
      ) : null}
      {analysis.ai_error ? (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">{analysis.ai_error}</p>
      ) : null}

      {analysis.suggestions.length > 0 ? (
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {analysis.suggestions.map((item, i) => (
            <li
              key={`${item.text}-${i}`}
              className={`border-l-2 pl-2 text-xs text-foreground/90 ${priorityClass(item.priority)}`}
            >
              {item.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{s.noSuggestions}</p>
      )}

      {analysis.outline.length > 0 ? (
        <div>
          <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{s.outlineTitle}</h4>
          <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
            {analysis.outline.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.title_ideas.length > 0 ? (
        <div>
          <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{s.titleIdeas}</h4>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {analysis.title_ideas.map((t) => (
              <li key={t} className="truncate">{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
