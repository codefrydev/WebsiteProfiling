import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import { Search, Link as LinkIcon, ArrowLeft, ExternalLink, Link2 } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useBrowserAssistant } from '../context/useBrowserAssistant.js';
import { strings } from '../lib/strings';
import { PageLayout, Card, Badge, Button } from '../components';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';

registerChartJsBase();
import {
  SELECT_CLASS, CONTENT_URL_KEYS, CONTENT_LABELS, CONTENT_RECOMMENDATIONS,
  SEO_ISSUE_RECOMMENDATIONS, formatMs, rtColor, formatPageHrefLines,
} from '../utils/linkUtils';
import { SortTh, RowTooltip, InspectorTabs, CopyBtn } from '../components/links';

export default function Links({ searchQuery = '' }) {
  const vl = strings.views.links;
  const sj = strings.common;
  const { data } = useReport();
  const { setFocusLink } = useBrowserAssistant();

  const [sortBy, setSortBy] = useState('inlinks');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 50;

  const [statusFilter, setStatusFilter] = useState(sj.all);
  const [inlinksFilter, setInlinksFilter] = useState(sj.all);
  const [rtFilter, setRtFilter] = useState(sj.all);
  const [wcFilter, setWcFilter] = useState(sj.all);

  const [inspectorUrl, setInspectorUrl] = useState(null);

  const [hoveredRow, setHoveredRow] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tableRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') setInspectorUrl(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!inspectorUrl || !data?.links?.length) return;
    const found = data.links.find((l) => l.url === inspectorUrl);
    if (found) setFocusLink(found);
  }, [inspectorUrl, data?.links, setFocusLink]);

  const links = useMemo(() => data?.links || [], [data]);

  const filtered = useMemo(() => {
    let list = [...links];
    if (statusFilter !== sj.all) list = list.filter((l) => String(l.status) === statusFilter);
    if (inlinksFilter === 'Orphans') list = list.filter((l) => (l.inlinks ?? 0) === 0);
    if (rtFilter === 'Fast') list = list.filter((l) => (l.response_time_ms ?? 0) < 500);
    if (rtFilter === 'Slow') list = list.filter((l) => (l.response_time_ms ?? 0) > 2000);
    if (wcFilter === 'Thin')   list = list.filter((l) => (l.word_count ?? 0) < 300);
    if (wcFilter === 'Medium') list = list.filter((l) => { const w = l.word_count ?? 0; return w >= 300 && w < 1000; });
    if (wcFilter === 'Long')   list = list.filter((l) => (l.word_count ?? 0) >= 1000);
    const q = (searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter((l) => {
        const url = (l.url || '').toLowerCase();
        const title = (l.title || '').toLowerCase();
        return url.includes(q) || title.includes(q) || String(l.status ?? '').includes(q);
      });
    }
    list.sort((a, b) => {
      let va = a[sortBy]; let vb = b[sortBy];
      if (sortBy === 'depth') { va = va != null ? va : -1; vb = vb != null ? vb : -1; return sortDesc ? vb - va : va - vb; }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb ?? '').toString().toLowerCase(); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [links, statusFilter, inlinksFilter, rtFilter, wcFilter, searchQuery, sortBy, sortDesc, sj.all]);

  const maxInlinksInResults = useMemo(() => {
    if (!filtered.length) return 1;
    let m = 0;
    for (const l of filtered) m = Math.max(m, l.inlinks ?? 0);
    return Math.max(1, m);
  }, [filtered]);

  const inspectorDetails = useMemo(() => {
    if (!inspectorUrl || !data) return null;
    const url = inspectorUrl;
    const issues = data.issues || {};
    const broken = (issues.broken || []).filter((item) => item.url === url);
    const redirects = (issues.redirects || []).filter((item) => item.url === url);
    const seoIssues = (issues.seo || []).filter((item) => item.url === url);
    const categoryIssues = [];
    (data.categories || []).forEach((cat) => {
      (cat.issues || []).forEach((iss) => {
        if (iss.url === url) categoryIssues.push({ category: cat.name || cat.id || '', ...iss });
      });
    });
    const contentUrls = data.content_urls || {};
    const contentFlags = [];
    CONTENT_URL_KEYS.forEach((key) => {
      const arr = contentUrls[key] || [];
      const entry = arr.find((item) => item.url === url);
      if (entry) {
        let detail = null;
        if (key === 'meta_desc_short' || key === 'meta_desc_long') detail = `${entry.meta_desc_len ?? 0} chars`;
        if (key === 'thin_content') detail = `${entry.content_length ?? 0} chars`;
        if (key === 'multiple_h1') detail = `${entry.h1_count ?? 0} H1s`;
        contentFlags.push({ type: key, label: CONTENT_LABELS[key] || key, detail, recommendation: CONTENT_RECOMMENDATIONS[key] || '' });
      }
    });
    const securityFindings = (data.security_findings || []).filter((item) => item.url === url);
    const allRecommendations = new Set();
    seoIssues.forEach((iss) => { const rec = SEO_ISSUE_RECOMMENDATIONS[iss.type]; if (rec) allRecommendations.add(rec); });
    contentFlags.forEach((f) => { if (f.recommendation) allRecommendations.add(f.recommendation); });
    categoryIssues.forEach((iss) => { if (iss.recommendation) allRecommendations.add(iss.recommendation); });
    securityFindings.forEach((f) => { if (f.recommendation) allRecommendations.add(f.recommendation); });
    return { broken, redirects, seoIssues, categoryIssues, contentFlags, securityFindings, recommendations: [...allRecommendations] };
  }, [inspectorUrl, data]);

  const handleRowMouseEnter = useCallback((e, link) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = tableRef.current?.getBoundingClientRect?.() || { top: 0, left: 0, width: 800 };
    setTooltipPos({
      top: rect.top - containerRect.top + rect.height + 4,
      left: Math.min(rect.left - containerRect.left, (containerRect.width || 800) - 290),
    });
    setHoveredRow(link.url);
  }, []);

  const exploreCharts = useMemo(() => {
    if (links.length === 0) return null;
    const statusMap = new Map();
    links.forEach((l) => {
      const s = String(l.status ?? sj.emDash);
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    });
    const statusPairs = [...statusMap.entries()].sort((a, b) => b[1] - a[1]);
    let thin = 0;
    let medium = 0;
    let long = 0;
    let noData = 0;
    links.forEach((l) => {
      const w = l.word_count;
      if (w == null || w === 0) {
        noData += 1;
        return;
      }
      if (w < 300) thin += 1;
      else if (w < 1000) medium += 1;
      else long += 1;
    });
    return {
      statusLabels: statusPairs.map((p) => p[0]),
      statusValues: statusPairs.map((p) => p[1]),
      wcLabels: vl.wcBands,
      wcValues: [thin, medium, long, noData],
    };
  }, [links, vl.wcBands, sj.emDash]);

  const exploreBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} ${n !== 1 ? vl.urlMany : vl.urlOne}`;
            },
          },
        },
      },
    };
  }, [vl]);

  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageLinks = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDesc((d) => !d);
    else {
      setSortBy(key);
      setSortDesc(['inlinks', 'depth', 'response_time_ms', 'word_count'].includes(key));
    }
    setPage(1);
  };

  const linkForInspector = inspectorUrl ? (links.find((l) => l.url === inspectorUrl) || null) : null;

  return (
    <PageLayout className="flex flex-col h-full">
      {inspectorUrl == null ? (
        <>
          <div className="mb-6 flex justify-between items-end shrink-0 flex-wrap gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-bright mb-2">{vl.title}</h1>
              <p className="text-muted-foreground">
                {vl.showingResults}{' '}
                <span className="font-bold text-bright">{filtered.length.toLocaleString()}</span> {vl.resultsSuffix}
              </p>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-relaxed">{vl.explorerHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={inlinksFilter} onChange={(e) => { setInlinksFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value={sj.all}>{vl.filterAllPages}</option>
                <option value="Orphans">{vl.filterOrphans}</option>
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value={sj.all}>{vl.filterAllStatus}</option>
                <option value="200">{vl.status200}</option>
                <option value="404">{vl.status404}</option>
                <option value="301">{vl.status301}</option>
                <option value="302">{vl.status302}</option>
              </select>
              <select value={rtFilter} onChange={(e) => { setRtFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value={sj.all}>{vl.filterAllRt}</option>
                <option value="Fast">{vl.filterFast}</option>
                <option value="Slow">{vl.filterSlow}</option>
              </select>
              <select value={wcFilter} onChange={(e) => { setWcFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value={sj.all}>{vl.filterAllWc}</option>
                <option value="Thin">{vl.filterThin}</option>
                <option value="Medium">{vl.filterMedium}</option>
                <option value="Long">{vl.filterLong}</option>
              </select>
            </div>
          </div>

          {exploreCharts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 shrink-0">
              <Card padding="tight" shadow>
                <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartStatusTitle}</h2>
                <p className="text-xs text-muted-foreground mb-2">{vl.chartStatusHint}</p>
                <div className="h-48">
                  <Bar
                    data={{
                      labels: exploreCharts.statusLabels,
                      datasets: [{ data: exploreCharts.statusValues, backgroundColor: palette(exploreCharts.statusLabels.length) }],
                    }}
                    options={exploreBarOpts}
                  />
                </div>
              </Card>
              <Card padding="tight" shadow>
                <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartWcTitle}</h2>
                <p className="text-xs text-muted-foreground mb-2">{vl.chartWcHint}</p>
                <div className="h-48">
                  <Bar
                    data={{
                      labels: exploreCharts.wcLabels,
                      datasets: [{ data: exploreCharts.wcValues, backgroundColor: palette(exploreCharts.wcLabels.length) }],
                    }}
                    options={exploreBarOpts}
                  />
                </div>
              </Card>
            </div>
          )}

          <Card overflowHidden padding="none" className="flex flex-col flex-1 min-h-[min(500px,70vh)] sm:min-h-[500px]">
            <div
              className="overflow-x-auto overflow-y-visible touch-pan-x overscroll-x-contain flex-1 relative scroll-smooth"
              ref={tableRef}
            >
              {hoveredRow && (() => {
                const link = links.find((l) => l.url === hoveredRow);
                return link ? <RowTooltip link={link} style={{ position: 'absolute', top: tooltipPos.top, left: tooltipPos.left }} /> : null;
              })()}

              <p className="sm:hidden text-xs text-muted-foreground px-3 py-2 border-b border-muted bg-brand-900/40">{sj.tableSwipeHint}</p>

              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-brand-900 uppercase text-xs font-semibold sticky top-0 z-20 shadow-sm">
                  <tr>
                    <SortTh
                      label={vl.thPage}
                      field="url"
                      sortBy={sortBy}
                      sortDesc={sortDesc}
                      onSort={toggleSort}
                      className="px-3 sm:px-6 sticky left-0 z-30 bg-brand-900 border-r border-default shadow-[4px_0_16px_-8px_rgba(0,0,0,0.55)]"
                    />
                    <SortTh label={vl.thStatus} field="status" sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <SortTh label={vl.thLinksIn} field="inlinks" sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <SortTh
                      label={vl.thCrawlDepth}
                      field="depth"
                      sortBy={sortBy}
                      sortDesc={sortDesc}
                      onSort={toggleSort}
                      className="hidden md:table-cell"
                    />
                    <SortTh label={vl.thLoadTime} field="response_time_ms" sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <SortTh
                      label={vl.thWords}
                      field="word_count"
                      sortBy={sortBy}
                      sortDesc={sortDesc}
                      onSort={toggleSort}
                      className="hidden md:table-cell"
                    />
                    <th className="px-3 sm:px-4 py-4 text-center text-muted-foreground uppercase text-xs whitespace-nowrap">{vl.thActions}</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y divide-muted [&>tr:nth-child(even)]:bg-brand-900/30 [&>tr>td:first-child]:sticky [&>tr>td:first-child]:left-0 [&>tr>td:first-child]:z-10 [&>tr>td:first-child]:bg-inherit [&>tr>td:first-child]:border-r [&>tr>td:first-child]:border-default [&>tr>td:first-child]:shadow-[4px_0_16px_-8px_rgba(0,0,0,0.5)] [&>tr>td:first-child]:max-w-[min(280px,85vw)]"
                >
                  {pageLinks.map((link, i) => {
                    const inl = link.inlinks ?? 0;
                    const inlPct = (inl / maxInlinksInResults) * 100;
                    const hrefLines = formatPageHrefLines(link.url);
                    return (
                    <tr
                      key={i}
                      className="hover:bg-brand-800/80 transition-colors cursor-default"
                      onMouseEnter={(e) => handleRowMouseEnter(e, link)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <td className="px-3 sm:px-6 py-3 align-top min-w-0">
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <div
                            className="text-bright font-medium text-sm leading-snug line-clamp-2"
                            title={link.title || undefined}
                          >
                            {link.title ? (
                              link.title
                            ) : (
                              <span className="text-muted-foreground italic font-normal">{vl.noTitle}</span>
                            )}
                          </div>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-link group min-w-0"
                            title={link.url}
                          >
                            <span className="truncate font-mono">{hrefLines.label}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                          </a>
                          {(link.depth != null || (link.word_count ?? 0) > 0) && (
                            <p className="mt-1 md:hidden text-[11px] text-muted-foreground leading-snug">
                              {link.depth != null && (
                                <span>
                                  {vl.thCrawlDepth}: {link.depth}
                                </span>
                              )}
                              {link.depth != null && (link.word_count ?? 0) > 0 && <span className="mx-1.5 text-muted-foreground">·</span>}
                              {(link.word_count ?? 0) > 0 && (
                                <span>
                                  {vl.thWords}: {link.word_count.toLocaleString()}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-middle"><Badge value={link.status ?? ''} /></td>
                      <td className="px-3 sm:px-4 py-3 text-right align-middle min-w-0">
                        <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                          <div className="order-2 sm:order-1 min-w-0 flex-1 bg-track rounded-full h-2 hidden sm:block">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-400 transition-all"
                              style={{ width: `${inlPct}%` }}
                            />
                          </div>
                          <span
                            className="order-1 sm:order-2 shrink-0 inline-flex items-center justify-end gap-1.5 text-sm font-semibold text-foreground tabular-nums"
                            title={
                              maxInlinksInResults > 0
                                ? `${Math.round(inlPct)}% of the strongest links-in count in your current results (${maxInlinksInResults}).`
                                : undefined
                            }
                          >
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:inline" aria-hidden />
                            {inl}
                          </span>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-foreground text-sm tabular-nums whitespace-nowrap align-middle">
                        {link.depth != null ? link.depth : sj.emDash}
                      </td>
                      <td className={`px-3 sm:px-4 py-3 text-sm font-semibold tabular-nums whitespace-nowrap align-middle ${rtColor(link.response_time_ms)}`}>
                        {formatMs(link.response_time_ms)}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-sm text-foreground tabular-nums whitespace-nowrap align-middle">
                        {link.word_count > 0 ? link.word_count.toLocaleString() : sj.emDash}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap align-middle">
                        <button
                          type="button"
                          onClick={() => setInspectorUrl(link.url)}
                          className="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-[2.75rem] sm:min-h-0 sm:min-w-0 text-muted-foreground hover:text-bright bg-brand-800 hover:bg-brand-700 px-3 py-2.5 sm:px-2 sm:py-1 rounded-lg sm:rounded text-xs font-medium transition-colors touch-manipulation"
                        >
                          <Search className="h-4 w-4 sm:h-3 sm:w-3 shrink-0" /> {vl.inspect}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-muted bg-brand-900 flex justify-between items-center shrink-0">
              <div className="text-sm text-muted-foreground">
                {vl.pageOf} <span className="font-bold text-bright">{page}</span> {vl.of}{' '}
                <span className="font-bold text-bright">{totalPages}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-foreground">{vl.previous}</Button>
                <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 text-foreground">{vl.next}</Button>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <>
          <div className="mb-4 flex justify-between items-center shrink-0 flex-wrap gap-4">
            <Button variant="secondary" onClick={() => setInspectorUrl(null)} className="inline-flex items-center gap-2 text-foreground">
              <ArrowLeft className="h-4 w-4" /> {vl.backToExplorer}
            </Button>
            <h1 className="text-2xl font-bold text-bright flex items-center gap-2">
              <LinkIcon className="h-6 w-6 text-blue-500 shrink-0" /> {vl.urlInspector}
            </h1>
          </div>

          <div className="mb-4 shrink-0 flex items-center gap-2 bg-brand-900 border border-default p-3 rounded-xl">
            <span className="font-mono text-link text-sm break-all flex-1">{inspectorUrl}</span>
            <CopyBtn text={inspectorUrl} className="shrink-0" />
            <a href={inspectorUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-bright transition-colors shrink-0">
              <LinkIcon className="h-4 w-4" />
            </a>
          </div>

          <Card padding="none" overflowHidden className="flex flex-col flex-1 min-h-0">
            {linkForInspector ? (
              <InspectorTabs
                link={linkForInspector}
                lhData={data.lighthouse_by_url?.[inspectorUrl] || null}
                inspectorDetails={inspectorDetails}
              />
            ) : (
              <div className="p-8 text-center text-muted-foreground">{vl.noUrlData}</div>
            )}
          </Card>
        </>
      )}
    </PageLayout>
  );
}
