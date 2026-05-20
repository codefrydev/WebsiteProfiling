'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search, AlertCircle, RefreshCw, Globe, Youtube, HelpCircle,
  AlertTriangle, ExternalLink,
} from 'lucide-react';
import { apiUrl } from '../../lib/publicBase';
import { strings, format } from '../../lib/strings';
import { Card } from '../index';
import SortablePaginatedTable from '../google/SortablePaginatedTable';
import { buildKeywordColumns } from './KeywordTableColumns';

export function CannibalisationPanel({ items }) {
  const c = strings.views.keywordsExplorer.cannib;

  if (!items?.length) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">{c.empty}</div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">{format(c.intro, { count: items.length })}</p>
      {items.map((item, i) => (
        <Card key={i} className="border-red-500/30 !bg-red-500/5">
          <p className="font-semibold text-foreground mb-3">&ldquo;{item.query}&rdquo;</p>
          <ul className="space-y-2">
            {(item.pages || []).map((p, j) => (
              <li key={j} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground w-14 shrink-0">
                  pos {parseFloat(p.position || 0).toFixed(1)}
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
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {format(c.clicks, { n: p.clicks })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export function ByPagePanel({ rows, ke }) {
  const bp = ke.byPage;
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [pageKws, setPageKws] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageSearch, setPageSearch] = useState('');

  const pages = useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (r.gsc_url) {
        if (!map[r.gsc_url]) map[r.gsc_url] = { url: r.gsc_url, impressions: 0, keywords: 0 };
        map[r.gsc_url].impressions += r.gsc_impressions || 0;
        map[r.gsc_url].keywords += 1;
      }
    }
    return Object.values(map).sort((a, b) => b.impressions - a.impressions);
  }, [rows]);

  const filteredPages = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.url.toLowerCase().includes(q));
  }, [pages, pageSearch]);

  const loadPage = useCallback(async (url) => {
    setSelectedUrl(url);
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/integrations/google/keywords/by-page?url=${encodeURIComponent(url)}`));
      const data = await res.json();
      setPageKws(data);
    } catch {
      setPageKws(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const paginationLabels = ke.table;

  if (pages.length === 0) {
    return <div className="text-center py-12 text-sm text-muted-foreground p-4">{bp.empty}</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[420px]">
      <div className="lg:w-80 xl:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-default flex flex-col">
        <div className="p-3 border-b border-default">
          <div className="flex items-center gap-1.5 bg-brand-900 border border-default rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter pages…"
              value={pageSearch}
              onChange={(e) => setPageSearch(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none w-full"
            />
          </div>
        </div>
        <div className="overflow-y-auto max-h-[360px] lg:max-h-none lg:flex-1 p-2">
          {filteredPages.map((p) => {
            const path = p.url.replace(/^https?:\/\/[^/]+/, '') || '/';
            const active = selectedUrl === p.url;
            return (
              <button
                key={p.url}
                type="button"
                onClick={() => loadPage(p.url)}
                className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-xs transition-colors ${
                  active ? 'bg-brand-700 ring-1 ring-accent text-foreground' : 'hover:bg-brand-800 text-muted-foreground'
                }`}
              >
                <div className={`font-medium truncate ${active ? 'text-foreground' : ''}`}>{path}</div>
                <div className="mt-0.5 opacity-80">
                  {format(bp.sidebarKw, { kw: p.keywords, impr: p.impressions.toLocaleString() })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-w-0 p-4">
        {!selectedUrl && (
          <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-muted-foreground">
            {bp.selectPage}
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-muted-foreground">
            {bp.loading}
          </div>
        )}
        {pageKws && !loading && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              {format(bp.keywordCount, { count: pageKws.keyword_count })}
            </p>
            {pageKws.cannibalisation?.length > 0 && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {format(bp.cannibWarning, { count: pageKws.cannibalisation.length })}
              </div>
            )}
            <SortablePaginatedTable
              columns={buildKeywordColumns(false, false, {}, ke)}
              rows={pageKws.keywords || []}
              defaultSort="gsc_impressions"
              emptyMessage={ke.table.noData}
              paginationLabels={paginationLabels}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function BulkSeedPanel() {
  const s = strings.views.keywordsExplorer.seeds;
  const [seeds, setSeeds] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const expand = async () => {
    const seedList = seeds.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!seedList.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/integrations/google/keywords/expand'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds: seedList, sources: ['web', 'youtube', 'questions'] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreview(data.results);
    } catch (e) {
      setError(e.message);
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
                {['web', 'youtube', 'questions'].map((src) => (
                  <div key={src}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      {src === 'web' && <Globe className="w-3 h-3" />}
                      {src === 'youtube' && <Youtube className="w-3 h-3" />}
                      {src === 'questions' && <HelpCircle className="w-3 h-3" />}
                      {src}
                    </div>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {(sources[src] || []).slice(0, 8).map((kw, i) => (
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
