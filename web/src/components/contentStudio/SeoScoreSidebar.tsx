'use client';

import { strings } from '@/lib/strings';
import type { ContentScoreResult } from '@/types/contentStudio';

interface SeoScoreSidebarProps {
  score: ContentScoreResult | null;
  loading: boolean;
  error: string | null;
  keyword: string;
}

function termStatusClass(status: string): string {
  if (status === 'included') {
    return 'text-green-700 dark:text-green-400';
  }
  if (status === 'partial') {
    return 'text-amber-700 dark:text-amber-400';
  }
  return 'text-red-700 dark:text-red-400';
}

function gradeColor(label: string): string {
  if (label === 'A' || label === 'B') return 'text-green-600 dark:text-green-400';
  if (label === 'C' || label === 'D') return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export default function SeoScoreSidebar({ score, loading, error, keyword }: SeoScoreSidebarProps) {
  const s = strings.views.contentStudio.sidebar;

  if (!keyword.trim()) {
    return (
      <aside className="rounded-xl border border-default bg-[var(--chat-bg)] p-4 text-sm text-muted-foreground">
        {s.noKeyword}
      </aside>
    );
  }

  return (
    <aside className="space-y-4 rounded-xl border border-default bg-[var(--chat-bg)] p-4 text-sm">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.provenanceBanner}</p>

      {loading && !score ? (
        <p className="text-muted-foreground">{s.scoring}</p>
      ) : null}
      {error ? <p className="text-xs text-red-700 dark:text-red-400">{error}</p> : null}

      {score ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold tabular-nums ${gradeColor(score.grade_label)}`}>
              {score.grade_label}
            </span>
            <span className="text-muted-foreground tabular-nums">({score.grade_score}/100)</span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">{s.wordCount}</dt>
              <dd className="font-medium tabular-nums">{score.word_count.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{s.readingLevel}</dt>
              <dd className="font-medium tabular-nums">{score.reading_level}</dd>
            </div>
          </dl>

          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2">{s.termsTitle}</h3>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {score.terms.length === 0 ? (
                <li className="text-xs text-muted-foreground">{s.noTerms}</li>
              ) : (
                score.terms.map((t) => (
                  <li key={t.term} className={`text-xs flex justify-between gap-2 ${termStatusClass(t.status)}`}>
                    <span className="truncate">{t.term}</span>
                    <span className="shrink-0 capitalize">{t.status}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2">{s.checksTitle}</h3>
            <ul className="space-y-2">
              {score.checks.map((c) => (
                <li key={c.id} className="text-xs">
                  <span className={c.pass ? 'text-green-700 dark:text-green-400' : 'text-amber-800 dark:text-amber-300'}>
                    {c.pass ? '✓' : '○'} {c.hint}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : !loading && !error ? (
        <p className="text-muted-foreground text-xs">{s.startWriting}</p>
      ) : null}
    </aside>
  );
}
