'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Save, ScanSearch, Sparkles } from 'lucide-react';
import { apiUrl } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import { Button } from '@/components';
import SeoScoreSidebar from './SeoScoreSidebar';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import { useContentScore } from './useContentScore';
import type { ContentAnalyzeResult, ContentDraftDetail, ContentScoreResult } from '@/types/contentStudio';

const RichTextEditor = dynamic(() => import('./RichTextEditor'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[200px] flex-1 rounded-lg border border-default bg-brand-900 animate-pulse" />
  ),
});

export interface ContentEditorProps {
  draft: ContentDraftDetail;
  propertyId: number;
  readOnly: boolean;
  saving: boolean;
  layout?: 'embedded' | 'page';
  siteLabel?: string;
  onBack?: () => void;
  aiSuggestionsEnabled?: boolean;
  onAiSuggestionsEnabledChange?: (enabled: boolean) => void;
  onScoreChange?: (score: ContentScoreResult | null) => void;
  onAnalysisChange?: (analysis: ContentAnalyzeResult | null) => void;
  onAnalyzeLoading?: (loading: boolean) => void;
  onAnalyzeError?: (error: string | null) => void;
  analysis?: ContentAnalyzeResult | null;
  analyzeLoading?: boolean;
  analyzeError?: string | null;
  onSave: (patch: {
    title: string;
    target_keyword: string;
    landing_url: string | null;
    title_tag: string;
    meta_description: string;
    body_html: string;
    grade_score: number | null;
    grade_snapshot: ContentScoreResult | null;
  }) => void;
}

export default function ContentEditor({
  draft,
  propertyId,
  readOnly,
  saving,
  layout = 'embedded',
  siteLabel,
  onBack,
  aiSuggestionsEnabled = true,
  onAiSuggestionsEnabledChange,
  onScoreChange,
  onAnalysisChange,
  onAnalyzeLoading,
  onAnalyzeError,
  analysis = null,
  analyzeLoading = false,
  analyzeError = null,
  onSave,
}: ContentEditorProps) {
  const s = strings.views.contentStudio.editor;
  const ai = strings.views.contentStudio.ai;
  const isPage = layout === 'page';

  const [title, setTitle] = useState(draft.title);
  const [keyword, setKeyword] = useState(draft.target_keyword);
  const [landingUrl, setLandingUrl] = useState(draft.landing_url || '');
  const [titleTag, setTitleTag] = useState(draft.title_tag);
  const [metaDescription, setMetaDescription] = useState(draft.meta_description);
  const [bodyHtml, setBodyHtml] = useState(draft.body_html);
  const [seoOpen, setSeoOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const { score, loading: scoreLoading, error: scoreError } = useContentScore({
    propertyId,
    keyword,
    bodyHtml,
    titleTag,
    metaDescription,
    landingUrl: landingUrl || null,
    enabled: !readOnly,
  });

  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const runAnalyze = useCallback(async (refresh = false) => {
    if (!keyword.trim()) return;
    setAnalyzing(true);
    onAnalyzeLoading?.(true);
    onAnalyzeError?.(null);
    try {
      const res = await fetch(apiUrl('/content/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          keyword,
          bodyHtml,
          titleTag,
          metaDescription,
          landingUrl: landingUrl.trim() || null,
          title,
          useAi: aiSuggestionsEnabled,
          refresh,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || ai.analyzeFailed);
      const analysis = (payload.analysis || null) as ContentAnalyzeResult | null;
      if (analysis?.score) onScoreChange?.(analysis.score);
      onAnalysisChange?.(analysis);
    } catch (e) {
      const msg = e instanceof Error ? e.message : ai.analyzeFailed;
      onAnalyzeError?.(msg);
      onAnalysisChange?.(null);
    } finally {
      setAnalyzing(false);
      onAnalyzeLoading?.(false);
    }
  }, [
    propertyId,
    keyword,
    bodyHtml,
    titleTag,
    metaDescription,
    landingUrl,
    title,
    aiSuggestionsEnabled,
    ai.analyzeFailed,
    onScoreChange,
    onAnalysisChange,
    onAnalyzeLoading,
    onAnalyzeError,
  ]);

  const handleSave = () => {
    onSave({
      title,
      target_keyword: keyword,
      landing_url: landingUrl.trim() || null,
      title_tag: titleTag,
      meta_description: metaDescription,
      body_html: bodyHtml,
      grade_score: score?.grade_score ?? null,
      grade_snapshot: score,
    });
  };

  const gradeBadge =
    score != null ? (
      <span className="rounded-md border border-default bg-brand-800 px-2 py-1 text-xs font-bold tabular-nums">
        {score.grade_label} · {score.grade_score}
      </span>
    ) : null;

  if (isPage) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-default bg-brand-950/80 px-4 py-2">
          <div className="min-w-0 flex-1">
            {siteLabel ? (
              <p className="text-[10px] text-muted-foreground truncate">{siteLabel}</p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" aria-hidden />
            <span className="hidden sm:inline">{ai.toggleLabel}</span>
            <button
              type="button"
              role="switch"
              aria-checked={aiSuggestionsEnabled}
              onClick={() => onAiSuggestionsEnabledChange?.(!aiSuggestionsEnabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                aiSuggestionsEnabled ? 'bg-fuchsia-600' : 'bg-brand-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  aiSuggestionsEnabled ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </label>
          {!readOnly ? (
            <Button
              type="button"
              variant="secondary"
              className="!py-1.5 !text-xs"
              onClick={() => void runAnalyze(false)}
              loading={analyzing}
              disabled={!keyword.trim()}
            >
              <ScanSearch className="h-3.5 w-3.5" aria-hidden />
              {analyzing ? ai.analyzing : ai.analyzeButton}
            </Button>
          ) : null}
          {gradeBadge}
          {!readOnly ? (
            <Button type="button" variant="primary" className="!py-1.5 !text-xs" onClick={handleSave} loading={saving}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              {saving ? s.saving : s.save}
            </Button>
          ) : null}
        </header>

        <div className="shrink-0 border-b border-default px-6 py-4 space-y-3 bg-brand-900/40">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={readOnly}
            placeholder={s.draftTitlePlaceholder}
            className="w-full bg-transparent text-2xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
          />
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={readOnly}
              placeholder={s.targetKeyword}
              className="min-w-[140px] flex-1 rounded-md border border-default bg-brand-900 px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
            />
            <input
              type="url"
              value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)}
              disabled={readOnly}
              placeholder={s.landingUrl}
              className="min-w-[180px] flex-[2] rounded-md border border-default bg-brand-900 px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => setSeoOpen((v) => !v)}
            className="text-xs text-link hover:underline"
          >
            {seoOpen ? s.hideSeoFields : s.showSeoFields}
          </button>
          {seoOpen ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={titleTag}
                onChange={(e) => setTitleTag(e.target.value)}
                disabled={readOnly}
                placeholder={s.titleTag}
                className="rounded-md border border-default bg-brand-900 px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
              />
              <input
                type="text"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                disabled={readOnly}
                placeholder={s.metaDescription}
                className="rounded-md border border-default bg-brand-900 px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
              />
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-3 xl:pr-4">
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            disabled={readOnly}
            placeholder={s.bodyPlaceholder}
            fillHeight
          />
        </div>

        <div className="xl:hidden border-t border-default p-3 max-h-64 overflow-y-auto space-y-3">
          <SeoScoreSidebar score={score} loading={scoreLoading} error={scoreError} keyword={keyword} />
          <AiSuggestionsPanel
            analysis={analysis}
            loading={analyzeLoading}
            error={analyzeError}
            visible={aiSuggestionsEnabled}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" className="!px-2" onClick={onBack}>
            {s.back}
          </Button>
        ) : null}
        {!readOnly ? (
          <Button type="button" variant="primary" onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" aria-hidden />
            {saving ? s.saving : s.save}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4 min-w-0">
          <label className="block text-xs text-muted-foreground">
            {s.draftTitle}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={readOnly}
              className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground disabled:opacity-60"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              {s.targetKeyword}
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={readOnly}
                className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {s.landingUrl}
              <input
                type="url"
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                disabled={readOnly}
                placeholder="https://"
                className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            {s.titleTag}
            <input
              type="text"
              value={titleTag}
              onChange={(e) => setTitleTag(e.target.value)}
              disabled={readOnly}
              className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground disabled:opacity-60"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            {s.metaDescription}
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              disabled={readOnly}
              rows={2}
              className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground resize-y disabled:opacity-60"
            />
          </label>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{s.body}</p>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              disabled={readOnly}
              placeholder={s.bodyPlaceholder}
            />
          </div>
        </div>
        <SeoScoreSidebar score={score} loading={scoreLoading} error={scoreError} keyword={keyword} />
      </div>
    </div>
  );
}
