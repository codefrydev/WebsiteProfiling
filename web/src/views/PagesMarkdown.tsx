'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUrlTab } from '@/hooks/useUrlTab';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import {
  normalizePropertyId,
  pickInitialPropertyId,
  siteUrlFromProperty,
  type PropertyPickCandidate,
} from '@/lib/googlePropertySelection';
import ChatShell from '@/components/chat/ChatShell';
import ViewTabs from '@/components/ViewTabs';
import { ViewTabPanel } from '@/components/ViewTabPanel';
import PageMarkdownSidebar from '@/components/pagesMarkdown/PageMarkdownSidebar';
import ExtractorPanel from '@/components/pagesMarkdown/ExtractorPanel';
import PreviewPanel from '@/components/pagesMarkdown/PreviewPanel';

const TABS = ['builder', 'preview'] as const;
type TabId = (typeof TABS)[number];

type PropertyOption = PropertyPickCandidate & { id: number };

function buildUrl(
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | null>,
): string {
  const next = new URLSearchParams(params.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) next.delete(k);
    else next.set(k, v);
  }
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export default function PagesMarkdown() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'builder');

  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [propertyId, setPropertyId] = useState<number | null>(
    normalizePropertyId(searchParams.get('propertyId')),
  );
  const [selectedRunId, setSelectedRunId] = useState<number | null>(
    Number(searchParams.get('crawlRunId') || '0') || null,
  );

  const [captureJobId, setCaptureJobId] = useState<string | null>(null);
  const [captureJobDone, setCaptureJobDone] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  const syncUrl = useCallback(
    (patch: Record<string, string | null>) => {
      router.replace(buildUrl('/pages-md', searchParams, patch), { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingProperties(true);
      try {
        const res = await apiFetch(apiUrl('/properties'));
        if (!res.ok) return;
        const data = (await res.json()) as { properties?: PropertyOption[] };
        if (cancelled) return;
        const rows = data.properties ?? [];
        setProperties(rows);
        const nextId = pickInitialPropertyId(rows, {
          explicitId: normalizePropertyId(searchParams.get('propertyId')),
          startUrl: '',
          activePropertyId: '',
        });
        if (nextId != null) setPropertyId((prev) => prev ?? nextId);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingProperties(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePropertyChange = (id: number) => {
    setPropertyId(id);
    setSelectedRunId(null);
    syncUrl({ propertyId: String(id), crawlRunId: null });
  };

  const handleRunSelect = (runId: number) => {
    setSelectedRunId(runId);
    syncUrl({ crawlRunId: String(runId) });
  };

  return (
    <ChatShell sidebar={(layout) => <PageMarkdownSidebar {...layout} />}>
      <div className="chat-main-panel">

        {/* ── Top header bar ── */}
        <header className="flex shrink-0 items-center gap-3 border-b border-default/60 bg-brand-900/80 px-4 py-3 sm:px-6">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground">Page Markdown</span>
            <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
              Extract &amp; preview per-page markdown from stored HTML
            </span>
          </div>

          {/* Property picker */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-muted-foreground hidden sm:block">Property</label>
            <select
              className="rounded-md border border-default bg-brand-800 px-3 py-1.5 text-sm text-foreground max-w-[220px] truncate"
              value={propertyId ?? ''}
              onChange={(e) => handlePropertyChange(Number(e.target.value))}
              disabled={loadingProperties || properties.length === 0}
            >
              {!propertyId && <option value="">— select —</option>}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {siteUrlFromProperty(p) || `Property #${p.id}`}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* ── Tab strip ── */}
        <div className="shrink-0 border-b border-default/60 bg-brand-900/60 px-4 pt-1 sm:px-6">
          <ViewTabs
            tabs={[
              { id: 'builder', label: 'Builder / Extractor' },
              { id: 'preview', label: 'Preview' },
            ]}
            activeTab={activeTab}
            onChange={(tab) => setActiveTab(tab as TabId)}
            ariaLabel="Page Markdown tabs"
            idPrefix="pages-md"
          />
        </div>

        {/* ── Main content — fills remaining height, scrolls internally ── */}
        <div className="chat-messages-scroll flex min-h-0 flex-1 overflow-hidden">

          {/* Builder tab */}
          <ViewTabPanel
            idPrefix="pages-md"
            tabId="builder"
            className={`flex-1 overflow-y-auto p-4 sm:p-6 ${activeTab !== 'builder' ? 'hidden' : ''}`}
          >
            <div className="mx-auto max-w-2xl">
              <ExtractorPanel
                propertyId={propertyId}
                selectedRunId={selectedRunId}
                onRunSelect={handleRunSelect}
                onExtracted={() => setPreviewRefreshKey((k) => k + 1)}
                onCaptureStart={(jobId) => { setCaptureJobId(jobId); setCaptureJobDone(false); }}
                captureJobId={captureJobId}
                captureJobDone={captureJobDone}
              />
            </div>
          </ViewTabPanel>

          {/* Preview tab — fills full height, layout is handled inside PreviewPanel */}
          <ViewTabPanel
            idPrefix="pages-md"
            tabId="preview"
            className={`flex min-h-0 flex-1 overflow-hidden ${activeTab !== 'preview' ? 'hidden' : ''}`}
          >
            <PreviewPanel
              crawlRunId={selectedRunId}
              refreshKey={previewRefreshKey}
            />
          </ViewTabPanel>

        </div>
      </div>
    </ChatShell>
  );
}
