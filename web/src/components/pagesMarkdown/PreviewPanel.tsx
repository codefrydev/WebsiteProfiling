
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Code, Copy, Eye, Loader2, Search } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import MarkdownPreview from './MarkdownPreview';
interface PageMarkdownListItem {
  id: number;
  url: string;
  title?: string | null;
  crawl_run_id: number | null;
  created_at: string | null;
  word_count?: number | null;
}

interface PageMarkdownContent {
  id: number;
  url: string;
  markdown: string | null;
  created_at: string | null;
}

const PAGE_SIZE = 25;

interface PreviewPanelProps {
  crawlRunId: number | null;
  refreshKey: number;
}

export default function PreviewPanel({ crawlRunId, refreshKey }: PreviewPanelProps) {
  const [items, setItems] = useState<PageMarkdownListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [content, setContent] = useState<PageMarkdownContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const loadList = useCallback(async () => {
    if (!crawlRunId) return;
    setLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        crawlRunId: String(crawlRunId),
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (query) params.set('q', query);
      const res = await apiFetch(apiUrl(`/page-markdown?${params.toString()}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load pages');
      const newItems = (data.items ?? []) as PageMarkdownListItem[];
      setItems(newItems);
      setTotal(data.total ?? 0);
      if (newItems.length > 0 && !selectedUrl) {
        setSelectedUrl(newItems[0].url);
        setSelectedIndex(0);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }, [crawlRunId, page, query, selectedUrl]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshKey]);

  const loadContent = useCallback(async (url: string) => {
    if (!crawlRunId) return;
    setLoadingContent(true);
    setContentError(null);
    setContent(null);
    try {
      const params = new URLSearchParams({ crawlRunId: String(crawlRunId), url });
      const res = await apiFetch(apiUrl(`/page-markdown/content?${params.toString()}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load content');
      setContent(data.content ?? null);
    } catch (e) {
      setContentError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingContent(false);
    }
  }, [crawlRunId]);

  useEffect(() => {
    if (selectedUrl) void loadContent(selectedUrl);
  }, [selectedUrl, loadContent]);

  const selectItem = (url: string, index: number) => {
    setSelectedUrl(url);
    setSelectedIndex(index);
    setRawMode(false);
    setCopied(false);
  };

  const navUrl = (delta: number) => {
    const newIdx = selectedIndex + delta;
    if (newIdx >= 0 && newIdx < items.length) selectItem(items[newIdx].url, newIdx);
  };

  const handleCopy = () => {
    if (content?.markdown) {
      void navigator.clipboard.writeText(content.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSelectedUrl(null);
    setSelectedIndex(-1);
  };

  if (!crawlRunId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground p-8">
        Select a crawl run and extract markdown from the Builder tab.
      </div>
    );
  }

  return (
    // Fill the full height given by the parent ViewTabPanel (which is flex + overflow-hidden)
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">

      {/* ── Left: URL list ── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-default/60 bg-brand-900/40 xl:w-72">

        {/* Search bar */}
        <form onSubmit={handleSearch} className="shrink-0 border-b border-default/60 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Filter URLs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-default bg-brand-800 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </form>

        {/* URL list — scrolls independently */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {listError ? (
            <p className="p-3 text-xs text-red-400">{listError}</p>
          ) : loadingList ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No pages found. Extract markdown from the Builder tab first.
            </p>
          ) : (
            <ul className="divide-y divide-default/50">
              {items.map((item, idx) => {
                const isActive = item.url === selectedUrl;
                return (
                  <li key={item.url}>
                    <button
                      type="button"
                      onClick={() => selectItem(item.url, idx)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        isActive
                          ? 'border-l-2 border-accent-warm bg-accent-warm/10'
                          : 'hover:bg-brand-800/60'
                      }`}
                    >
                      <p
                        className={`text-xs font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                        title={item.title ?? item.url}
                      >
                        {item.title ?? '(no title)'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground truncate" title={item.url}>
                        {item.url}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {(item.word_count ?? 0).toLocaleString()} words
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Pagination footer */}
        <div className="shrink-0 border-t border-default/60 p-2 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex items-center gap-0.5 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {page} / {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-0.5 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {total > 0 ? (
            <p className="text-center text-[10px] text-muted-foreground">
              {total.toLocaleString()} pages total
            </p>
          ) : null}
        </div>
      </aside>

      {/* ── Right: Markdown content pane ── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">

        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-default/60 bg-brand-900/60 px-4 py-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              disabled={selectedIndex <= 0}
              onClick={() => navUrl(-1)}
              className="rounded p-1 text-muted-foreground hover:bg-brand-800 hover:text-foreground disabled:opacity-40"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={selectedIndex >= items.length - 1}
              onClick={() => navUrl(1)}
              className="rounded p-1 text-muted-foreground hover:bg-brand-800 hover:text-foreground disabled:opacity-40"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-1 min-w-0 truncate text-xs text-muted-foreground" title={selectedUrl ?? ''}>
              {selectedUrl ?? 'Select a page from the list'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRawMode((r) => !r)}
              title={rawMode ? 'Rendered preview' : 'Raw markdown'}
              className={`rounded border p-1.5 text-xs ${
                rawMode
                  ? 'border-accent-warm text-accent-warm'
                  : 'border-default text-muted-foreground hover:text-foreground'
              }`}
            >
              {rawMode ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!content}
              title="Copy markdown"
              className="rounded border border-default p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {copied ? <span className="text-xs text-green-400">Copied!</span> : null}
          </div>
        </div>

        {/* Scrollable markdown content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
          {loadingContent ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : contentError ? (
            <p className="text-sm text-red-400">{contentError}</p>
          ) : !selectedUrl ? (
            <p className="text-sm text-muted-foreground">Select a page from the list.</p>
          ) : !content ? (
            <p className="text-sm text-muted-foreground">No content.</p>
          ) : (
            <MarkdownPreview content={content.markdown ?? ''} raw={rawMode} />
          )}
        </div>
      </div>
    </div>
  );
}
