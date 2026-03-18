import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search, Link as LinkIcon, ArrowLeft } from 'lucide-react';
import { useReport } from '../context/useReport';
import { PageLayout, Card, Badge, Button } from '../components';
import {
  SELECT_CLASS, CONTENT_URL_KEYS, CONTENT_LABELS, CONTENT_RECOMMENDATIONS,
  SEO_ISSUE_RECOMMENDATIONS, formatMs, rtColor,
} from '../utils/linkUtils';
import { SortTh, RowTooltip, InspectorTabs, CopyBtn } from '../components/links';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Links({ searchQuery = '' }) {
  const { data } = useReport();

  // Table state
  const [sortBy, setSortBy] = useState('inlinks');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 50;

  // Filter state
  const [statusFilter, setStatusFilter] = useState('All');
  const [inlinksFilter, setInlinksFilter] = useState('All');
  const [rtFilter, setRtFilter] = useState('All');
  const [wcFilter, setWcFilter] = useState('All');

  // Inspector state
  const [inspectorUrl, setInspectorUrl] = useState(null);

  // Hover tooltip state
  const [hoveredRow, setHoveredRow] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tableRef = useRef(null);

  // Escape key closes inspector
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') setInspectorUrl(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const links = useMemo(() => data?.links || [], [data]);

  const filtered = useMemo(() => {
    let list = [...links];
    if (statusFilter !== 'All') list = list.filter((l) => String(l.status) === statusFilter);
    if (inlinksFilter === 'Orphans') list = list.filter((l) => (l.inlinks ?? 0) === 0);
    if (rtFilter === 'Fast') list = list.filter((l) => (l.response_time_ms ?? 0) < 500);
    if (rtFilter === 'Slow') list = list.filter((l) => (l.response_time_ms ?? 0) > 2000);
    if (wcFilter === 'Thin')   list = list.filter((l) => (l.word_count ?? 0) < 300);
    if (wcFilter === 'Medium') list = list.filter((l) => { const w = l.word_count ?? 0; return w >= 300 && w < 1000; });
    if (wcFilter === 'Long')   list = list.filter((l) => (l.word_count ?? 0) >= 1000);
    const q = (searchQuery || '').toLowerCase();
    if (q) list = list.filter((l) => (l.url || '').toLowerCase().includes(q));
    list.sort((a, b) => {
      let va = a[sortBy]; let vb = b[sortBy];
      if (sortBy === 'depth') { va = va != null ? va : -1; vb = vb != null ? vb : -1; return sortDesc ? vb - va : va - vb; }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb ?? '').toString().toLowerCase(); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [links, statusFilter, inlinksFilter, rtFilter, wcFilter, searchQuery, sortBy, sortDesc]);

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
          {/* ── Header + Filters ── */}
          <div className="mb-6 flex justify-between items-end shrink-0 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-bright mb-2">Link Explorer</h1>
              <p className="text-slate-400">
                Analyze discovered URLs. Showing{' '}
                <span className="font-bold text-bright">{filtered.length.toLocaleString()}</span> results.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={inlinksFilter} onChange={(e) => { setInlinksFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value="All">All pages</option>
                <option value="Orphans">Orphans (0 inlinks)</option>
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value="All">All Status Codes</option>
                <option value="200">200 OK</option>
                <option value="404">404 Not Found</option>
                <option value="301">301 Redirect</option>
                <option value="302">302 Redirect</option>
              </select>
              <select value={rtFilter} onChange={(e) => { setRtFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value="All">All Response Times</option>
                <option value="Fast">Fast (&lt;500ms)</option>
                <option value="Slow">Slow (&gt;2s)</option>
              </select>
              <select value={wcFilter} onChange={(e) => { setWcFilter(e.target.value); setPage(1); }} className={SELECT_CLASS}>
                <option value="All">All Word Counts</option>
                <option value="Thin">Thin (&lt;300)</option>
                <option value="Medium">Medium (300–1000)</option>
                <option value="Long">Long (1000+)</option>
              </select>
            </div>
          </div>

          {/* ── Table ── */}
          <Card overflowHidden padding="none" className="flex flex-col flex-1 min-h-[500px]">
            <div className="overflow-x-auto flex-1 relative" ref={tableRef}>
              {hoveredRow && (() => {
                const link = links.find((l) => l.url === hoveredRow);
                return link ? <RowTooltip link={link} style={{ position: 'absolute', top: tooltipPos.top, left: tooltipPos.left }} /> : null;
              })()}

              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-brand-900 uppercase text-xs font-semibold sticky top-0 z-10 shadow-sm">
                  <tr>
                    <SortTh label="URL Path"    field="url"             sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} className="px-6" />
                    <SortTh label="Status"      field="status"          sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <SortTh label="Inlinks"     field="inlinks"         sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <SortTh label="Depth"       field="depth"           sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <SortTh label="Resp. Time"  field="response_time_ms"sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <SortTh label="Words"       field="word_count"      sortBy={sortBy} sortDesc={sortDesc} onSort={toggleSort} />
                    <th className="px-4 py-4 text-center text-slate-400 uppercase text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {pageLinks.map((link, i) => (
                    <tr
                      key={i}
                      className="hover:bg-brand-800 transition-colors cursor-default"
                      onMouseEnter={(e) => handleRowMouseEnter(e, link)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <td className="px-6 py-3 font-mono text-blue-400 text-xs truncate max-w-[350px]" title={link.url}>
                        <a href={link.url} target="_blank" rel="noreferrer" className="hover:underline">{link.url}</a>
                      </td>
                      <td className="px-4 py-3"><Badge value={link.status ?? ''} /></td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{link.inlinks ?? 0}</td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{link.depth != null ? link.depth : '—'}</td>
                      <td className={`px-4 py-3 font-mono text-xs font-semibold ${rtColor(link.response_time_ms)}`}>
                        {formatMs(link.response_time_ms)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        {link.word_count > 0 ? link.word_count.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setInspectorUrl(link.url)}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-bright bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-xs transition-colors"
                        >
                          <Search className="h-3 w-3" /> Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-muted bg-brand-900 flex justify-between items-center shrink-0">
              <div className="text-sm text-slate-400">
                Page <span className="font-bold text-bright">{page}</span> of{' '}
                <span className="font-bold text-bright">{totalPages}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-slate-300">Previous</Button>
                <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 text-slate-300">Next</Button>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* ── Inspector header ── */}
          <div className="mb-4 flex justify-between items-center shrink-0 flex-wrap gap-4">
            <Button variant="secondary" onClick={() => setInspectorUrl(null)} className="inline-flex items-center gap-2 text-slate-300">
              <ArrowLeft className="h-4 w-4" /> Back to Link Explorer
            </Button>
            <h1 className="text-2xl font-bold text-bright flex items-center gap-2">
              <LinkIcon className="h-6 w-6 text-blue-500 shrink-0" /> URL Inspector
            </h1>
          </div>

          {/* URL bar */}
          <div className="mb-4 shrink-0 flex items-center gap-2 bg-brand-900 border border-default p-3 rounded-xl">
            <span className="font-mono text-blue-400 text-sm break-all flex-1">{inspectorUrl}</span>
            <CopyBtn text={inspectorUrl} className="shrink-0" />
            <a href={inspectorUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-bright transition-colors shrink-0">
              <LinkIcon className="h-4 w-4" />
            </a>
          </div>

          {/* Tabbed Inspector */}
          <Card padding="none" overflowHidden className="flex flex-col flex-1 min-h-0">
            {linkForInspector ? (
              <InspectorTabs
                link={linkForInspector}
                lhData={data.lighthouse_by_url?.[inspectorUrl] || null}
                inspectorDetails={inspectorDetails}
              />
            ) : (
              <div className="p-8 text-center text-slate-500">No data found for this URL.</div>
            )}
          </Card>
        </>
      )}
    </PageLayout>
  );
}
