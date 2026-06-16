'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, RefreshCw } from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { apiUrl } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import {
  normalizePropertyId,
  pickInitialPropertyId,
  siteUrlFromProperty,
} from '@/lib/googlePropertySelection';
import WriteStudioShell from '@/components/contentStudio/WriteStudioShell';
import WriteStudioSidebar, {
  type WritePropertyOption,
} from '@/components/contentStudio/WriteStudioSidebar';
import WriteContextBar from '@/components/contentStudio/WriteContextBar';
import WriteSuggestedStarters from '@/components/contentStudio/WriteSuggestedStarters';
import ContentEditor from '@/components/contentStudio/ContentEditor';
import NewDraftModal from '@/components/contentStudio/NewDraftModal';
import AnalyzerSidebar from '@/components/contentStudio/AnalyzerSidebar';
import { useContentStudioAiToggle } from '@/hooks/useContentStudioAiToggle';
import type { ContentAnalyzeResult, ContentDraftDetail, ContentDraftListItem, ContentScoreResult } from '@/types/contentStudio';

function buildWriteUrl(params: URLSearchParams): string {
  const q = params.toString();
  return q ? `/write?${q}` : '/write';
}

export default function WriteStudio() {
  const vs = strings.views.contentStudio;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configState, configLoaded } = usePipeline();
  const { readOnly } = useReadOnlySession();

  const [properties, setProperties] = useState<WritePropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(
    normalizePropertyId(searchParams.get('propertyId')),
  );
  const [loadingProperties, setLoadingProperties] = useState(true);

  const draftParam = searchParams.get('draft');
  const keywordParam = searchParams.get('keyword') || '';
  const draftId = draftParam && draftParam !== 'new' ? Number(draftParam) : null;

  const [drafts, setDrafts] = useState<ContentDraftListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState<ContentDraftDetail | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(draftParam === 'new');
  const [modalKeyword, setModalKeyword] = useState(keywordParam);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveScore, setLiveScore] = useState<ContentScoreResult | null>(null);
  const [analysis, setAnalysis] = useState<ContentAnalyzeResult | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [aiSuggestionsEnabled, setAiSuggestionsEnabled] = useContentStudioAiToggle();

  const syncUrl = useCallback(
    (patch: { propertyId?: number | null; draft?: number | null; removeDraft?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.propertyId != null) params.set('propertyId', String(patch.propertyId));
      if (patch.removeDraft) params.delete('draft');
      else if (patch.draft != null) params.set('draft', String(patch.draft));
      router.replace(buildWriteUrl(params));
    },
    [router, searchParams],
  );

  const loadProperties = useCallback(async () => {
    if (!configLoaded) return;
    setLoadingProperties(true);
    try {
      const res = await fetch(apiUrl('/properties'));
      if (!res.ok) return;
      const data = (await res.json()) as { properties?: WritePropertyOption[] };
      const rows = (data.properties || []).map((p) => ({
        ...p,
        id: normalizePropertyId(p.id) ?? Number(p.id),
      }));
      setProperties(rows);
      const domainFromUrl =
        searchParams.get('domain') ?? searchParams.get('brand') ?? '';
      const domainStartUrl = domainFromUrl.trim()
        ? domainFromUrl.startsWith('http')
          ? domainFromUrl.trim()
          : `https://${domainFromUrl.trim()}`
        : '';
      const nextId = pickInitialPropertyId(rows, {
        explicitId: normalizePropertyId(searchParams.get('propertyId')),
        startUrl: domainStartUrl || String(configState.start_url || ''),
        activePropertyId: String(configState.active_property_id || ''),
      });
      if (nextId != null) setPropertyId(nextId);
    } catch {
      /* ignore */
    } finally {
      setLoadingProperties(false);
    }
  }, [configLoaded, configState.active_property_id, configState.start_url, searchParams]);

  const loadDrafts = useCallback(async () => {
    if (!propertyId) {
      setDrafts([]);
      return;
    }
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch(apiUrl(`/content-drafts?propertyId=${propertyId}`));
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || vs.loadFailed);
      setDrafts((payload.drafts || []) as ContentDraftListItem[]);
    } catch (e) {
      setListError(e instanceof Error ? e.message : vs.loadFailed);
    } finally {
      setLoadingList(false);
    }
  }, [propertyId, vs.loadFailed]);

  const loadDraft = useCallback(async (id: number) => {
    setLoadingDraft(true);
    setDraftError(null);
    try {
      const res = await fetch(apiUrl(`/content-drafts/${id}`));
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || vs.loadFailed);
      setActiveDraft((payload.draft || null) as ContentDraftDetail | null);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : vs.loadFailed);
      setActiveDraft(null);
    } finally {
      setLoadingDraft(false);
    }
  }, [vs.loadFailed]);

  useEffect(() => {
    if (!configLoaded) return;
    void loadProperties();
  }, [configLoaded, loadProperties]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    if (draftId && Number.isFinite(draftId)) {
      setLiveScore(null);
      setAnalysis(null);
      setAnalyzeError(null);
      void loadDraft(draftId);
    } else {
      setActiveDraft(null);
      setLiveScore(null);
      setAnalysis(null);
      setAnalyzeError(null);
    }
  }, [draftId, loadDraft]);

  useEffect(() => {
    if (draftParam === 'new') {
      setModalKeyword(keywordParam);
      setShowNewModal(true);
    }
  }, [draftParam, keywordParam]);

  const openNewDraft = useCallback((keyword = '') => {
    setModalKeyword(keyword);
    setShowNewModal(true);
  }, []);

  const handlePropertyChange = (id: number) => {
    setPropertyId(id);
    setActiveDraft(null);
    syncUrl({ propertyId: id, removeDraft: true });
  };

  const handleSelectDraft = (id: number) => {
    syncUrl({ draft: id });
  };

  const handleCreate = async (fields: {
    title: string;
    target_keyword: string;
    landing_url: string | null;
  }) => {
    if (!propertyId || readOnly) return;
    setCreating(true);
    try {
      const res = await fetch(apiUrl('/content-drafts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, ...fields }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || vs.createFailed);
      setShowNewModal(false);
      syncUrl({ draft: Number(payload.id) });
      await loadDrafts();
    } catch (e) {
      setListError(e instanceof Error ? e.message : vs.createFailed);
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (patch: {
    title: string;
    target_keyword: string;
    landing_url: string | null;
    title_tag: string;
    meta_description: string;
    body_html: string;
    grade_score: number | null;
    grade_snapshot: ContentScoreResult | null;
  }) => {
    if (!draftId || readOnly) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/content-drafts/${draftId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || vs.saveFailed);
      setActiveDraft((payload.draft || null) as ContentDraftDetail | null);
      await loadDrafts();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : vs.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (readOnly) return;
    try {
      const res = await fetch(apiUrl(`/content-drafts/${id}`), { method: 'DELETE' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || vs.deleteFailed);
      if (draftId === id) syncUrl({ removeDraft: true });
      await loadDrafts();
    } catch (e) {
      setListError(e instanceof Error ? e.message : vs.deleteFailed);
    }
  };

  const activeProperty = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  const emptyState = !loadingProperties && !propertyId;
  const isHero = !emptyState && !draftId && !loadingDraft;
  const showEditor = Boolean(draftId && activeDraft && propertyId && !loadingDraft && !draftError);

  const seoPanel =
    showEditor && activeDraft ? (
      <AnalyzerSidebar
        score={liveScore}
        scoreLoading={!liveScore && Boolean(draftId)}
        scoreError={null}
        keyword={activeDraft.target_keyword}
        analysis={analysis}
        analyzeLoading={analyzeLoading}
        analyzeError={analyzeError}
        aiVisible={aiSuggestionsEnabled}
      />
    ) : null;

  const mainPanel = (
    <div className="chat-main-panel">
      {!showEditor ? (
        <WriteContextBar
          property={activeProperty}
          propertyId={propertyId}
          draftTitle={activeDraft?.title}
          loading={loadingProperties}
        />
      ) : null}

      {emptyState ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">{vs.noProperty}</p>
        </div>
      ) : isHero ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[10vh] pt-4">
          <div className="flex w-full max-w-3xl flex-col items-center">
            <h1 className="text-center text-[2rem] font-normal tracking-tight text-bright sm:text-5xl sm:font-light">
              {vs.welcomeHeadline}
            </h1>
            <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">
              {vs.welcomeSubline}
            </p>
            {!readOnly && propertyId ? (
              <div className="mt-10 w-full">
                <button
                  type="button"
                  onClick={() => openNewDraft()}
                  className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 rounded-full border border-default bg-[var(--chat-surface)] px-4 py-3 text-sm text-foreground shadow-lg ring-1 ring-white/[0.06] transition-shadow hover:bg-[var(--chat-surface-hover)] chat-hero-input min-h-[3.25rem]"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {vs.newDraftButton}
                </button>
              </div>
            ) : null}
            <WriteSuggestedStarters
              onSelect={(keyword) => openNewDraft(keyword)}
              disabled={readOnly || !propertyId}
            />
            {listError ? <p className="mt-4 text-xs text-red-500">{listError}</p> : null}
          </div>
        </div>
      ) : draftId && loadingDraft ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          {vs.loadingDraft}
        </div>
      ) : draftId && (draftError || !activeDraft) ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
          <p className="text-sm text-red-700 dark:text-red-400">{draftError || vs.loadFailed}</p>
        </div>
      ) : showEditor && activeDraft && propertyId ? (
        <ContentEditor
          layout="page"
          draft={activeDraft}
          propertyId={propertyId}
          readOnly={readOnly}
          saving={saving}
          onSave={handleSave}
          siteLabel={activeProperty ? siteUrlFromProperty(activeProperty) : undefined}
          onScoreChange={setLiveScore}
          aiSuggestionsEnabled={aiSuggestionsEnabled}
          onAiSuggestionsEnabledChange={setAiSuggestionsEnabled}
          onAnalysisChange={setAnalysis}
          onAnalyzeLoading={setAnalyzeLoading}
          onAnalyzeError={setAnalyzeError}
          analysis={analysis}
          analyzeLoading={analyzeLoading}
          analyzeError={analyzeError}
        />
      ) : null}
    </div>
  );

  return (
    <>
      <WriteStudioShell
        sidebar={(layout) => (
          <WriteStudioSidebar
            {...layout}
            properties={properties}
            propertyId={propertyId}
            onPropertyChange={handlePropertyChange}
            drafts={drafts}
            activeDraftId={draftId}
            onSelectDraft={handleSelectDraft}
            onNewDraft={() => openNewDraft()}
            onDeleteDraft={(id) => void handleDelete(id)}
            loadingDrafts={loadingList}
            readOnly={readOnly}
          />
        )}
        seoPanel={seoPanel ?? undefined}
      >
        {mainPanel}
      </WriteStudioShell>

      <NewDraftModal
        open={showNewModal}
        initialKeyword={modalKeyword}
        creating={creating}
        onClose={() => {
          setShowNewModal(false);
          if (draftParam === 'new') syncUrl({ removeDraft: true });
        }}
        onCreate={(fields) => void handleCreate(fields)}
      />
    </>
  );
}
