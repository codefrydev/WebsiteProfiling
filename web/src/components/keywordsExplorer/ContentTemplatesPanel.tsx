'use client';

import { useCallback, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import type { KeywordRow } from '@/types/components';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { Card, Button } from '@/components';

const TEMPLATES = [
  {
    id: 'blog',
    title: 'Blog post',
    outline: ['H1 with primary keyword', 'Intro (150 words)', 'H2 sections (3–5)', 'FAQ block', 'Internal links (3+)'],
  },
  {
    id: 'landing',
    title: 'Landing page',
    outline: ['Hero + value prop', 'Social proof', 'Feature bullets', 'Primary CTA', 'Schema: Organization or Product'],
  },
  {
    id: 'comparison',
    title: 'Comparison page',
    outline: ['H1: X vs Y', 'Summary table', 'Pros/cons per option', 'Recommendation', 'FAQ schema'],
  },
] as const;

interface ContentBriefResult {
  keyword?: string;
  summary?: string;
  provenance?: string;
}

interface ContentTemplatesPanelProps {
  defaultKeyword?: string;
  clusterRows?: KeywordRow[];
}

export default function ContentTemplatesPanel({ defaultKeyword = '', clusterRows = [] }: ContentTemplatesPanelProps) {
  const s = strings.views.keywordsExplorer.contentBrief;
  const { readOnly } = useReadOnlySession();
  const [activeTemplate, setActiveTemplate] = useState<(typeof TEMPLATES)[number] | null>(null);
  const [keyword, setKeyword] = useState(defaultKeyword);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<ContentBriefResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openTemplate = useCallback(
    (template: (typeof TEMPLATES)[number]) => {
      if (readOnly) return;
      setActiveTemplate(template);
      setBrief(null);
      setError(null);
      if (!keyword.trim() && defaultKeyword) setKeyword(defaultKeyword);
    },
    [readOnly, keyword, defaultKeyword],
  );

  const generateBrief = useCallback(async () => {
    if (readOnly || !activeTemplate) return;
    const kw = keyword.trim();
    if (!kw) {
      setError('Enter a target keyword first.');
      return;
    }
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      const res = await apiFetch(apiUrl('/keywords/content-brief'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: `${kw} (${activeTemplate.title} template)`,
          rows: clusterRows.slice(0, 20),
          templateId: activeTemplate.id,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || s.failed);
      setBrief((payload.brief || null) as ContentBriefResult | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : s.failed);
    } finally {
      setLoading(false);
    }
  }, [readOnly, activeTemplate, keyword, clusterRows, s.failed]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.id} className="p-4 flex flex-col">
            <h3 className="text-sm font-semibold">{t.title}</h3>
            <ul className="mt-2 text-xs text-muted-foreground space-y-1 flex-1 list-disc pl-4">
              {t.outline.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              className="mt-3 !py-1.5 !text-xs"
              onClick={() => openTemplate(t)}
              disabled={readOnly}
            >
              Use template
            </Button>
          </Card>
        ))}
      </div>
      {activeTemplate ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="content-template-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-default bg-brand-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-default px-4 py-3">
              <h3 id="content-template-title" className="text-sm font-semibold text-bright">
                {activeTemplate.title}
              </h3>
              <button
                type="button"
                onClick={() => setActiveTemplate(null)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label={s.close}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="px-4 py-4 space-y-3 text-sm">
              <label className="block text-xs text-muted-foreground">
                Target keyword
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
                  placeholder="primary keyword"
                />
              </label>
              <Button type="button" variant="primary" className="!text-xs" onClick={() => void generateBrief()} disabled={loading || readOnly}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
                {loading ? s.loading : s.buttonLabel}
              </Button>
              {error ? <p className="text-red-700 dark:text-red-400 text-xs">{error}</p> : null}
              {brief?.summary ? (
                <>
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed font-sans">
                    {brief.summary}
                  </pre>
                  {brief.provenance ? (
                    <p className="text-[10px] text-muted-foreground">{s.provenance}: {brief.provenance}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
