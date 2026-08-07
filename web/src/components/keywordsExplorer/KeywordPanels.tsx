
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, AlertCircle, RefreshCw, Globe, Youtube, HelpCircle,
  AlertTriangle, ExternalLink, Loader2, ChevronRight, FileText, Link2, Split,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { apiUrl, apiFetch, readApiErrorMessage } from '../../lib/publicBase';
import { buildLinksInspectHref } from '../../lib/reportNav';
import UrlInspectorButton from '@/components/UrlInspectorButton';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildCannibalisationContext, buildMisalignmentContext } from '@/lib/fixSuggestionContext';
import { strings, format } from '../../lib/strings';
import { Card } from '../index';
import DevCopyJsonButton from '../DevCopyJsonButton';
import CopyBtn from '../links/CopyBtn';
import SortablePaginatedTable from '../google/SortablePaginatedTable';
import { buildKeywordColumns } from './KeywordTableColumns';
import {
  aggregatePagesFromRows,
  filterPages,
  sortPages,
  type PageSortKey,
} from './keywordPageUtils';
import type {
  CannibalisationItem,
  KeywordByPageResponse,
  KeywordExpandResult,
  KeywordRow,
  QueryPageMisalignmentItem,
} from '@/types/components';
import KeywordEmptyState from './KeywordEmptyState';

type CannibSort = 'query' | 'pages';

interface CannibalisationPanelProps {
  items: CannibalisationItem[];
}

export function CannibalisationPanel({ items }: CannibalisationPanelProps) {
  const c = strings.views.keywordsExplorer.cannib;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CannibSort>('pages');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items ?? [];
    if (q) {
      list = list.filter((item) => String(item.query || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sort === 'query') {
        return String(a.query || '').localeCompare(String(b.query || ''));
      }
      return (b.pages?.length || 0) - (a.pages?.length || 0);
    });
  }, [items, search, sort]);

  const devData = useMemo(
    () => ({
      widget: 'keywordsExplorer.cannib.panel',
      searchQuery: search || null,
      sort,
      rowCount: filtered.length,
      items: filtered,
    }),
    [filtered, search, sort],
  );

  if (!items?.length) {
    return <KeywordEmptyState icon={Split} title={c.empty} description="" />;
  }

  return (
    <div className="relative group/dev-card p-4 sm:p-5">
      <DevCopyJsonButton data={devData} />
      <div className="mb-4 p-3 rounded-xl border border-red-500/25 bg-red-500/5">
        <p className="text-sm text-foreground font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" aria-hidden />
          {format(c.intro, { count: items.length })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 bg-brand-900 border border-default rounded-lg px-2.5 py-1.5 flex-1 min-w-[12rem] max-w-md">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
          <input
            type="search"
            placeholder={c.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none w-full min-w-0"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CannibSort)}
          className="bg-brand-900 border border-default rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none cursor-pointer"
        >
          <option value="pages">{c.sortPages}</option>
          <option value="query">{c.sortQuery}</option>
        </select>
        {search.trim() && (
          <span className="text-xs text-muted-foreground tabular-nums ml-auto">
            {format(c.showingCount, { count: filtered.length, total: items.length })}
          </span>
        )}
      </div>
      {filtered.length === 0 ? (
        <KeywordEmptyState
          icon={Search}
          title={c.emptyFiltered}
          description={c.empty}
          action={{ label: strings.views.keywordsExplorer.filters.clear, onClick: () => setSearch('') }}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item, i) => (
            <Card key={i} className="border-red-500/30 !bg-red-500/5">
              <p className="font-semibold text-foreground mb-3">&ldquo;{item.query}&rdquo;</p>
              <ul className="space-y-2">
                {(item.pages || []).map((p, j) => (
                  <li key={j} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-muted-foreground w-14 shrink-0">
                      pos {parseFloat(String(p.position || 0)).toFixed(1)}
                    </span>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link hover:underline truncate flex-1 min-w-0"
                    >
                      {p.url}
                      <ExternalLink className="w-2.5 h-2.5 inline ml-0.5 shrink-0" />
                    </a>
                    <UrlInspectorButton url={p.url} />
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {format(c.clicks, { n: p.clicks })}
                    </span>
                  </li>
                ))}
              </ul>
              <AiSuggestionButton request={buildCannibalisationContext(item)} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface QueryPageMisalignmentPanelProps {
  items: QueryPageMisalignmentItem[];
}

export function QueryPageMisalignmentPanel({ items }: QueryPageMisalignmentPanelProps) {
  const a = strings.views.keywordsExplorer.alignment;
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items ?? [];
    if (q) {
      list = list.filter(
        (item) =>
          String(item.keyword || '').toLowerCase().includes(q) ||
          String(item.current_url || '').toLowerCase().includes(q) ||
          String(item.suggested_url || '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((x, y) => (y.impressions || 0) - (x.impressions || 0));
  }, [items, search]);

  const devData = useMemo(
    () => ({
      widget: 'keywordsExplorer.alignment.panel',
      searchQuery: search || null,
      rowCount: filtered.length,
      items: filtered,
    }),
    [filtered, search],
  );

  if (!items?.length) {
    return <KeywordEmptyState icon={Link2} title={a.empty} description="" />;
  }

  return (
    <div className="relative group/dev-card p-4 sm:p-5">
      <DevCopyJsonButton data={devData} />
      <div className="mb-4 p-3 rounded-xl border border-amber-500/25 bg-amber-500/5">
        <p className="text-sm text-foreground font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
          {format(a.intro, { count: items.length })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 bg-brand-900 border border-default rounded-lg px-2.5 py-1.5 flex-1 min-w-[12rem] max-w-md">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
          <input
            type="search"
            placeholder={a.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none w-full min-w-0"
          />
        </div>
      </div>
      <div className="space-y-3">
        {filtered.map((item, i) => (
          <Card key={`${item.keyword}-${item.current_url}-${i}`} className="border-amber-500/25 !bg-amber-500/5">
            <p className="font-semibold text-foreground mb-2">&ldquo;{item.keyword}&rdquo;</p>
            <p className="text-xs text-muted-foreground mb-2 tabular-nums">
              {format(a.metrics, {
                impressions: (item.impressions || 0).toLocaleString(),
                position: parseFloat(String(item.position || 0)).toFixed(1),
              })}
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground shrink-0">{a.currentUrl}</span>
                <a href={item.current_url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline truncate min-w-0 flex-1 font-mono">
                  {item.current_url}
                </a>
                <UrlInspectorButton url={item.current_url} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground shrink-0">{a.suggestedUrl}</span>
                <a href={item.suggested_url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline truncate min-w-0 flex-1 font-mono">
                  {item.suggested_url}
                </a>
                <UrlInspectorButton url={item.suggested_url} />
              </div>
            </div>
            <AiSuggestionButton request={buildMisalignmentContext(item)} />
          </Card>
        ))}
      </div>
    </div>
  );
}

interface ByPagePanelProps {
  rows: KeywordRow[];
  ke: typeof strings.views.keywordsExplorer;
  brandQuery?: string | null;
}

export function ByPagePanel({ rows, ke, brandQuery = null }: ByPagePanelProps) {
  const bp = ke.byPage;
  const [searchParams] = useSearchParams();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [pageKws, setPageKws] = useState<KeywordByPageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [sortKey, setSortKey] = useState<PageSortKey>('impressions');

  const pages = useMemo(() => sortPages(aggregatePagesFromRows(rows), sortKey), [rows, sortKey]);
  const filteredPages = useMemo(() => filterPages(pages, pageSearch), [pages, pageSearch]);
  const maxImpressions = useMemo(
    () => Math.max(1, ...pages.map((p) => p.impressions)),
    [pages],
  );

  const selectedPage = useMemo(
    () => pages.find((p) => p.url === selectedUrl) ?? null,
    [pages, selectedUrl],
  );

  const loadPage = useCallback(async (url: string) => {
    setSelectedUrl(url);
    setLoading(true);
    setPageKws(null);
    try {
      const domainParam = brandQuery ? `&domain=${encodeURIComponent(brandQuery)}` : '';
      const res = await apiFetch(
        apiUrl(`/integrations/google/keywords/by-page?url=${encodeURIComponent(url)}${domainParam}`),
      );
      const data = (await res.json().catch(() => ({}))) as KeywordByPageResponse;
      if (!res.ok) throw new Error(readApiErrorMessage(data as Record<string, unknown>, res, 'Failed to load page keywords'));
      setPageKws(data);
    } catch {
      setPageKws(null);
    } finally {
      setLoading(false);
    }
  }, [brandQuery]);

  useEffect(() => {
    if (pages.length === 0) {
      setSelectedUrl(null);
      setPageKws(null);
      return;
    }
    if (!selectedUrl || !pages.some((p) => p.url === selectedUrl)) {
      void loadPage(pages[0].url);
    }
  }, [pages, selectedUrl, loadPage]);

  const paginationLabels = ke.table;
  const inspectHref =
    selectedUrl != null ? buildLinksInspectHref(selectedUrl, searchParams) : null;

  const devData = useMemo(
    () => ({
      widget: 'keywordsExplorer.bypage.panel',
      pageSearch: pageSearch || null,
      sortKey,
      pageCount: pages.length,
      pages: filteredPages,
      selectedUrl,
      selectedPageKeywords: pageKws?.keywords ?? [],
      keywordCount: pageKws?.keyword_count ?? null,
    }),
    [filteredPages, pageKws, pageSearch, pages.length, selectedUrl, sortKey],
  );

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" aria-hidden />
        <p className="text-sm text-muted-foreground max-w-sm">{bp.empty}</p>
      </div>
    );
  }

  return (
    <div className="relative group/dev-card flex flex-col lg:flex-row min-h-[480px]">
      <DevCopyJsonButton data={devData} />
      <aside className="lg:w-[min(100%,22rem)] xl:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-default flex flex-col bg-brand-900/40">
        <div className="p-3 border-b border-default space-y-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {bp.sidebarTitle}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {format(bp.sidebarCount, { count: pages.length })}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-brand-900 border border-default rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
            <input
              type="search"
              placeholder={bp.searchPlaceholder}
              value={pageSearch}
              onChange={(e) => setPageSearch(e.target.value)}
              aria-label={bp.searchPlaceholder}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none w-full min-w-0"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as PageSortKey)}
            className="w-full bg-brand-900 border border-default rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none cursor-pointer"
            aria-label={bp.sortImpressions}
          >
            <option value="impressions">{bp.sortImpressions}</option>
            <option value="keywords">{bp.sortKeywords}</option>
            <option value="path">{bp.sortPath}</option>
          </select>
        </div>
        <div
          className="overflow-y-auto overscroll-contain p-2 lg:flex-1 lg:max-h-[min(70vh,560px)]"
          role="listbox"
          aria-label={bp.sidebarTitle}
        >
          {filteredPages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-2">{bp.noFilterMatch}</p>
          ) : (
            filteredPages.map((p) => {
              const active = selectedUrl === p.url;
              const barPct = Math.round((p.impressions / maxImpressions) * 100);
              return (
                <button
                  key={p.url}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => void loadPage(p.url)}
                  className={`group w-full text-left rounded-xl mb-1.5 overflow-hidden border transition-all ${
                    active
                      ? 'border-accent/60 bg-brand-700/80 shadow-sm'
                      : 'border-transparent hover:border-default hover:bg-brand-800/80'
                  }`}
                >
                  <div className="px-3 pt-2.5 pb-2 relative">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-medium truncate leading-snug ${
                            active ? 'text-bright' : 'text-foreground'
                          }`}
                          title={p.path}
                        >
                          {p.path}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                              active ? 'bg-accent/20 text-accent' : 'bg-brand-800 text-muted-foreground'
                            }`}
                          >
                            {format(bp.keywordsBadge, { n: p.keywords })}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {p.impressions.toLocaleString()} impr.
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 mt-0.5 transition-transform ${
                          active ? 'text-accent translate-x-0.5' : 'text-muted-foreground/50 group-hover:text-muted-foreground'
                        }`}
                        aria-hidden
                      />
                    </div>
                    <div
                      className="absolute bottom-0 left-0 h-0.5 bg-accent/70 transition-all"
                      style={{ width: `${barPct}%` }}
                      aria-hidden
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {!selectedUrl && !loading && (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center min-h-[240px]">
            <FileText className="h-9 w-9 text-muted-foreground/40 mb-3" aria-hidden />
            <p className="text-sm text-muted-foreground max-w-xs">{bp.selectPage}</p>
          </div>
        )}

        {selectedUrl && (
          <div className="border-b border-default px-4 py-3 bg-brand-900/30 shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {selectedPage ? format(bp.totalImpressions, { n: selectedPage.impressions.toLocaleString() }) : null}
                </p>
                <a
                  href={selectedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-link hover:underline break-all leading-relaxed inline-flex items-start gap-1"
                >
                  {selectedUrl}
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <CopyBtn text={selectedUrl} className="text-xs" />
                {inspectHref && (
                  <Link
                    to={inspectHref}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-default bg-brand-800 hover:bg-brand-700 text-foreground transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5" aria-hidden />
                    {bp.inspectUrl}
                  </Link>
                )}
                <a
                  href={selectedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  {bp.openUrl}
                </a>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 p-4 min-h-[280px]">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
              {bp.loading}
            </div>
          )}
          {pageKws && !loading && selectedUrl && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-bright">
                {format(bp.keywordCount, { count: pageKws.keyword_count ?? 0 })}
              </p>
              {(pageKws.cannibalisation?.length ?? 0) > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  <span>{format(bp.cannibWarning, { count: pageKws.cannibalisation!.length })}</span>
                </div>
              )}
              <SortablePaginatedTable
                columns={buildKeywordColumns(false, false, {}, ke)}
                rows={(pageKws.keywords || []) as Array<Record<string, unknown>>}
                defaultSort="gsc_impressions"
                emptyMessage={ke.table.noData}
                paginationLabels={paginationLabels}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BulkSeedPanel({ brandQuery = null }: { brandQuery?: string | null }) {
  const s = strings.views.keywordsExplorer.seeds;
  const [seeds, setSeeds] = useState('');
  const [preview, setPreview] = useState<KeywordExpandResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expand = async (): Promise<void> => {
    const seedList = seeds.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!seedList.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl('/integrations/google/keywords/expand'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seeds: seedList,
          sources: ['web', 'youtube', 'questions'],
          ...(brandQuery ? { domain: brandQuery } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; results?: KeywordExpandResult };
      if (!res.ok) throw new Error(readApiErrorMessage(data as Record<string, unknown>, res, data.error || 'Expand failed'));
      if (data.error) throw new Error(data.error);
      setPreview(data.results ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card padding="default" className="mb-6">
      <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
        <Search className="w-4 h-4 text-link" />
        {s.title}
      </h3>
      <p className="text-xs text-muted-foreground mb-3">{s.hint}</p>
      <textarea
        className="w-full h-28 bg-brand-900 border border-default rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent font-mono"
        placeholder={s.placeholder}
        value={seeds}
        onChange={(e) => setSeeds(e.target.value)}
      />
      <button
        type="button"
        onClick={expand}
        disabled={loading || !seeds.trim()}
        className="mt-3 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
      >
        {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
        {loading ? s.expanding : s.expand}
      </button>
      {error && (
        <div className="mt-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {preview && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(preview).map(([seed, sources]) => (
            <Card key={seed} padding="tight" className="!bg-brand-900">
              <p className="font-semibold text-sm text-foreground mb-2">&ldquo;{seed}&rdquo;</p>
              <div className="grid grid-cols-3 gap-2">
                {(['web', 'youtube', 'questions'] as const).map((src) => (
                  <div key={src}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      {src === 'web' && <Globe className="w-3 h-3" />}
                      {src === 'youtube' && <Youtube className="w-3 h-3" />}
                      {src === 'questions' && <HelpCircle className="w-3 h-3" />}
                      {src}
                    </div>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {(sources[src] || []).slice(0, 8).map((kw: string, i: number) => (
                        <li key={i} className="text-xs text-foreground truncate">
                          {kw}
                        </li>
                      ))}
                      {!(sources[src] || []).length && (
                        <li className="text-xs text-muted-foreground">{s.noResults}</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
