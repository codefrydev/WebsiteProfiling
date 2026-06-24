
import { useMemo, useState } from 'react';
import { Check, Circle, Copy } from 'lucide-react';
import { strings, format } from '@/lib/strings';
import type { ContentScoreResult, ContentScoreTerm } from '@/types/contentStudio';

type TermSort = 'importance' | 'coverage' | 'alpha';

/** Heuristic recommended-uses range derived from the term's target + importance. */
function recRange(t: ContentScoreTerm): [number, number] {
  const low = Math.max(1, t.target);
  const high = Math.max(low + 1, t.importance === 'high' ? t.target * 3 : t.target * 2);
  return [low, high];
}

interface SeoScoreSidebarProps {
  score: ContentScoreResult | null;
  loading: boolean;
  error: string | null;
  keyword: string;
}

/** Color the letter grade by its leading letter so the full A++…F scale is covered. */
function gradeColor(label: string): string {
  const head = (label || '').charAt(0).toUpperCase();
  if (head === 'A') return 'text-green-600 dark:text-green-400';
  if (head === 'B') return 'text-emerald-600 dark:text-emerald-400';
  if (head === 'C') return 'text-amber-600 dark:text-amber-400';
  if (head === 'D') return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

/** A term is "covered" once it hits its recommended count. */
function isCovered(t: ContentScoreTerm): boolean {
  return t.count >= Math.max(1, t.target);
}

/** Sort actionable terms first: missing → partial → under-target → covered. */
function termRank(t: ContentScoreTerm): number {
  if (t.status === 'missing') return t.importance === 'high' ? 0 : 1;
  if (t.status === 'partial') return 2;
  if (!isCovered(t)) return 3;
  return 4;
}

function termTone(t: ContentScoreTerm): { text: string; bar: string } {
  if (isCovered(t)) return { text: 'text-green-700 dark:text-green-400', bar: 'bg-green-500' };
  if (t.status === 'included') return { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500' };
  if (t.status === 'partial') return { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-400' };
  return { text: 'text-red-700 dark:text-red-400', bar: 'bg-red-500' };
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

          <WordCountTile score={score} />
          <ReadingLevelTile score={score} />

          <TermsSection terms={score.terms} />

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

function WordCountTile({ score }: { score: ContentScoreResult }) {
  const s = strings.views.contentStudio.sidebar;
  const target = score.word_count_target || 0;
  const pct = target > 0 ? Math.min(100, Math.round((score.word_count / target) * 100)) : 0;
  const inRange = score.word_count >= score.word_count_min && score.word_count <= score.word_count_max;
  const bar = inRange ? 'bg-green-500' : score.word_count > score.word_count_max ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{s.wordCount}</span>
        <span className="tabular-nums">
          <span className="font-medium text-foreground">{score.word_count.toLocaleString()}</span>
          {target > 0 ? (
            <span className="text-muted-foreground"> · {format(s.wordCountTarget, { target: target.toLocaleString() })}</span>
          ) : null}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-800">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ReadingLevelTile({ score }: { score: ContentScoreResult }) {
  const s = strings.views.contentStudio.sidebar;
  const grade = score.reading_level;
  const target = score.reading_level_target || 12;
  let label = s.readabilityNone;
  let tone = 'text-muted-foreground';
  if (grade > 0) {
    if (grade <= target) {
      label = s.readabilityClear;
      tone = 'text-green-700 dark:text-green-400';
    } else if (grade <= target + 2) {
      label = s.readabilityModerate;
      tone = 'text-amber-700 dark:text-amber-400';
    } else {
      label = s.readabilityComplex;
      tone = 'text-red-700 dark:text-red-400';
    }
  }
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-muted-foreground">{s.readingLevel}</span>
      <span className="tabular-nums">
        <span className="font-medium text-foreground">{format(s.readingGrade, { grade })}</span>
        <span className={`ml-1.5 ${tone}`}>· {label}</span>
      </span>
    </div>
  );
}

function sortTerms(terms: ContentScoreTerm[], sort: TermSort): ContentScoreTerm[] {
  const copy = [...terms];
  if (sort === 'alpha') return copy.sort((a, b) => a.term.localeCompare(b.term));
  if (sort === 'coverage') {
    return copy.sort((a, b) => {
      const ga = Math.min(1, a.count / Math.max(1, a.target));
      const gb = Math.min(1, b.count / Math.max(1, b.target));
      return ga - gb; // least covered first
    });
  }
  return copy.sort((a, b) => termRank(a) - termRank(b));
}

function TermRow({ t }: { t: ContentScoreTerm }) {
  const s = strings.views.contentStudio.sidebar;
  const tone = termTone(t);
  const target = Math.max(1, t.target);
  const pct = Math.min(100, Math.round((t.count / target) * 100));
  const [low, high] = recRange(t);
  const covered = isCovered(t);
  return (
    <li className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-1.5">
          {covered ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
          ) : (
            <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
          )}
          <span className="min-w-0">
            <span className={`block truncate text-xs font-medium ${tone.text}`}>{t.term}</span>
            <span className="block text-[10px] text-muted-foreground">
              {format(s.recommendedRange, { low, high })} · {format(s.yourUses, { count: t.count })}
            </span>
          </span>
        </span>
        {t.importance === 'high' ? (
          <span className="shrink-0 text-[9px] uppercase tracking-wide text-amber-500" title="High importance">
            ★
          </span>
        ) : null}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-brand-800">
        <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function TermsSection({ terms }: { terms: ContentScoreTerm[] }) {
  const s = strings.views.contentStudio.sidebar;
  const [sort, setSort] = useState<TermSort>('importance');
  const [grouped, setGrouped] = useState(false);
  const [copied, setCopied] = useState(false);

  const covered = terms.filter(isCovered).length;
  const sorted = useMemo(() => sortTerms(terms, sort), [terms, sort]);
  const high = sorted.filter((t) => t.importance === 'high');
  const other = sorted.filter((t) => t.importance !== 'high');

  const copyTerms = () => {
    const list = terms
      .filter((t) => !isCovered(t))
      .map((t) => t.term)
      .join(', ');
    if (list && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(list);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold text-foreground">{s.termsTitle}</h3>
        {terms.length > 0 ? (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {format(s.termsCovered, { covered, total: terms.length })}
          </span>
        ) : null}
      </div>

      {terms.length > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as TermSort)}
            className="rounded-md border border-default bg-[var(--chat-surface)] px-1.5 py-1 text-[11px] text-foreground focus:outline-none"
            aria-label={s.sortImportance}
          >
            <option value="importance">{s.sortImportance}</option>
            <option value="coverage">{s.sortCoverage}</option>
            <option value="alpha">{s.sortAlpha}</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="h-3 w-3" />
            {s.groupByImportance}
          </label>
          <button
            type="button"
            onClick={copyTerms}
            title={s.copyTerms}
            className="ml-auto flex items-center gap-1 rounded-md border border-default px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3 w-3" aria-hidden />
            {copied ? s.copied : null}
          </button>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">{s.noTerms}</p>
      ) : grouped ? (
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {high.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{s.groupHigh}</p>
              <ul className="space-y-2">
                {high.map((t) => (
                  <TermRow key={t.term} t={t} />
                ))}
              </ul>
            </div>
          ) : null}
          {other.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{s.groupOther}</p>
              <ul className="space-y-2">
                {other.map((t) => (
                  <TermRow key={t.term} t={t} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {sorted.map((t) => (
            <TermRow key={t.term} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
