
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Circle, Info, Loader2, RefreshCw } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import SeoScoreSidebar from './SeoScoreSidebar';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import type {
  ContentAnalyzeResult,
  ContentScoreResult,
  WizardOption,
  WizardOutlineItem,
  WizardOutlineResult,
  WizardResearchResult,
} from '@/types/contentStudio';

type Tab = 'terms' | 'research' | 'outline';

export interface EditorInsightsPanelProps {
  score: ContentScoreResult | null;
  scoreLoading: boolean;
  scoreError: string | null;
  keyword: string;
  title?: string;
  bodyHtml?: string;
  analysis: ContentAnalyzeResult | null;
  analyzeLoading: boolean;
  analyzeError: string | null;
  aiVisible: boolean;
}

async function callWizard<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(apiUrl('/content/wizard'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json.result as T;
}

export default function EditorInsightsPanel(props: EditorInsightsPanelProps) {
  const p = strings.views.contentStudio.panel;
  const [tab, setTab] = useState<Tab>('terms');
  const termCount = props.score?.terms.length ?? 0;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'terms', label: termCount ? `${p.tabTerms} (${termCount})` : p.tabTerms },
    { id: 'research', label: p.tabResearch },
    { id: 'outline', label: p.tabOutline },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 border-b border-default">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-link text-link'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={tab === 'terms' ? '' : 'hidden'}>
        <SeoScoreSidebar
          score={props.score}
          loading={props.scoreLoading}
          error={props.scoreError}
          keyword={props.keyword}
        />
        {props.aiVisible ? (
          <div className="mt-3">
            <AiSuggestionsPanel
              analysis={props.analysis}
              loading={props.analyzeLoading}
              error={props.analyzeError}
              visible={props.aiVisible}
            />
          </div>
        ) : null}
      </div>

      <div className={tab === 'research' ? '' : 'hidden'}>
        <ResearchTab active={tab === 'research'} keyword={props.keyword} title={props.title} />
      </div>

      <div className={tab === 'outline' ? '' : 'hidden'}>
        <OutlineTab
          active={tab === 'outline'}
          keyword={props.keyword}
          title={props.title}
          bodyHtml={props.bodyHtml}
        />
      </div>
    </div>
  );
}

function AiNote() {
  return (
    <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      {strings.views.contentStudio.panel.aiNote}
    </p>
  );
}

function ResearchTab({ active, keyword, title }: { active: boolean; keyword: string; title?: string }) {
  const p = strings.views.contentStudio.panel;
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [sources, setSources] = useState<WizardOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedKey = useRef<string | null>(null);

  const kw = keyword.trim();

  const load = useCallback(async () => {
    if (!kw) return;
    setLoading(true);
    setError(null);
    try {
      const r = await callWizard<WizardResearchResult>({ step: 'research', keyword: kw, title });
      setQuestions(r.questions || []);
      setSources(r.sources || []);
      loadedKey.current = kw;
    } catch (e) {
      setError(e instanceof Error ? e.message : p.researchError);
    } finally {
      setLoading(false);
    }
  }, [kw, title, p.researchError]);

  useEffect(() => {
    if (active && kw && loadedKey.current !== kw && !loading) void load();
  }, [active, kw, load, loading]);

  if (!kw) return <p className="text-xs text-muted-foreground">{p.keywordNeeded}</p>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <AiNote />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex shrink-0 items-center gap-1 text-xs text-link hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          {p.refresh}
        </button>
      </div>

      {loading && !questions ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {p.loading}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-700 dark:text-red-400">{error}</p> : null}

      {questions && questions.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-foreground">{p.questions}</h3>
          <ul className="space-y-1.5">
            {questions.map((q) => (
              <li key={q} className="text-xs text-foreground/90">
                {q}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sources && sources.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-foreground">{p.sources}</h3>
          <ul className="space-y-1.5">
            {sources.map((s) => (
              <li key={s.label} className="text-xs">
                <span className="font-medium text-foreground">{s.label}</span>
                {s.description ? <span className="text-muted-foreground"> — {s.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function draftHeadings(html: string | undefined): string[] {
  if (typeof window === 'undefined' || !html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('h1, h2, h3'))
    .map((h) => (h.textContent || '').trim().toLowerCase())
    .filter(Boolean);
}

function headingCovered(text: string, headings: string[]): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return headings.some((h) => h === t || h.includes(t) || t.includes(h));
}

function OutlineTab({
  active,
  keyword,
  title,
  bodyHtml,
}: {
  active: boolean;
  keyword: string;
  title?: string;
  bodyHtml?: string;
}) {
  const p = strings.views.contentStudio.panel;
  const [outline, setOutline] = useState<WizardOutlineItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedKey = useRef<string | null>(null);

  const kw = keyword.trim();

  const load = useCallback(async () => {
    if (!kw) return;
    setLoading(true);
    setError(null);
    try {
      const r = await callWizard<WizardOutlineResult>({ step: 'outline', keyword: kw, title });
      setOutline(r.outline || []);
      loadedKey.current = kw;
    } catch (e) {
      setError(e instanceof Error ? e.message : p.outlineError);
    } finally {
      setLoading(false);
    }
  }, [kw, title, p.outlineError]);

  useEffect(() => {
    if (active && kw && loadedKey.current !== kw && !loading) void load();
  }, [active, kw, load, loading]);

  if (!kw) return <p className="text-xs text-muted-foreground">{p.keywordNeeded}</p>;

  const headings = draftHeadings(bodyHtml);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-foreground">{p.outlineHeading}</h3>
          <p className="text-[10px] text-muted-foreground">{p.outlineSub}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex shrink-0 items-center gap-1 text-xs text-link hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          {p.refresh}
        </button>
      </div>

      {loading && !outline ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {p.loading}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-700 dark:text-red-400">{error}</p> : null}

      {outline && outline.length > 0 ? (
        <ul className="space-y-1.5">
          {outline.map((item, i) => {
            const covered = item.level === 'h1' || headingCovered(item.text, headings);
            return (
              <li
                key={`${item.text}-${i}`}
                className={`flex items-start gap-1.5 text-xs ${
                  item.level === 'h3' ? 'ml-5' : item.level === 'h2' ? 'ml-2' : ''
                }`}
              >
                {covered ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
                )}
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 text-[9px] uppercase text-muted-foreground/70">{item.level}</span>
                  <span className={covered ? 'text-foreground' : 'text-muted-foreground'}>{item.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <AiNote />
    </div>
  );
}
