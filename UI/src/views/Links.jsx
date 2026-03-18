import { useState, useMemo, useEffect } from 'react';
import { Search, Link as LinkIcon, ArrowLeft } from 'lucide-react';
import { useReport } from '../context/useReport';
import { PageLayout, Card, Badge, Button } from '../components';

const selectClass = 'bg-brand-800 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 outline-none';

const CONTENT_URL_KEYS = [
  'missing_h1', 'missing_title', 'multiple_h1', 'missing_meta_desc',
  'meta_desc_short', 'meta_desc_long', 'thin_content',
];
const CONTENT_LABELS = {
  missing_h1: 'Missing H1',
  missing_title: 'Missing title',
  multiple_h1: 'Multiple H1s',
  missing_meta_desc: 'Missing meta description',
  meta_desc_short: 'Meta description too short',
  meta_desc_long: 'Meta description too long',
  thin_content: 'Thin content',
};
const CONTENT_RECOMMENDATIONS = {
  missing_h1: 'Add exactly one H1 per page.',
  missing_title: 'Add a unique title (30–60 chars).',
  multiple_h1: 'Use a single H1 per page.',
  missing_meta_desc: 'Add a meta description (70–160 chars).',
  meta_desc_short: 'Aim for 70–160 characters.',
  meta_desc_long: 'Shorten to 70–160 characters.',
  thin_content: 'Expand content to at least 300 characters.',
};
const SEO_ISSUE_RECOMMENDATIONS = {
  missing_title: 'Add a unique title (30–60 chars).',
  title_short: 'Aim for 30–60 characters.',
  title_long: 'Shorten title to 30–60 characters.',
  meta_desc_short: 'Aim for 70–160 characters.',
  meta_desc_long: 'Shorten to 70–160 characters.',
  h1_missing: 'Add exactly one H1 per page.',
  h1_multi: 'Use a single H1 per page.',
  thin_content: 'Expand content to at least 300 characters.',
};

export default function Links({ searchQuery = '' }) {
  const { data } = useReport();
  const [sortBy, setSortBy] = useState('inlinks');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [statusFilter, setStatusFilter] = useState('All');
  const [inlinksFilter, setInlinksFilter] = useState('All');
  const [inspectorUrl, setInspectorUrl] = useState(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setInspectorUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const links = useMemo(() => data?.links || [], [data]);
  const filtered = useMemo(() => {
    let list = [...links];
    if (statusFilter !== 'All') {
      list = list.filter((l) => String(l.status) === statusFilter);
    }
    if (inlinksFilter === 'Orphans') {
      list = list.filter((l) => (l.inlinks ?? 0) === 0);
    }
    const q = (searchQuery || '').toLowerCase();
    if (q) {
      list = list.filter((l) => (l.url || '').toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (sortBy === 'depth') {
        va = va != null ? va : -1;
        vb = vb != null ? vb : -1;
        return sortDesc ? vb - va : va - vb;
      }
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = (vb ?? '').toString().toLowerCase();
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [links, statusFilter, inlinksFilter, searchQuery, sortBy, sortDesc]);

  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageLinks = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDesc((d) => !d);
    else {
      setSortBy(key);
      setSortDesc(key === 'inlinks' || key === 'depth');
    }
    setPage(1);
  };

  const depthVal = (l) => (l.depth != null ? l.depth : '—');

  const linkForInspector = inspectorUrl ? (links.find((l) => l.url === inspectorUrl) || null) : null;
  const indexability = !linkForInspector ? 'Unknown' : String(linkForInspector.status).match(/^2/) ? 'Indexable' : String(linkForInspector.status).match(/^[45]/) ? 'Not indexable' : 'Unknown';

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
        if (iss.url === url) {
          categoryIssues.push({ category: cat.name || cat.id || '', ...iss });
        }
      });
    });
    const contentUrls = data.content_urls || {};
    const contentFlags = [];
    CONTENT_URL_KEYS.forEach((key) => {
      const arr = contentUrls[key] || [];
      const entry = arr.find((item) => item.url === url);
      if (entry) {
        const label = CONTENT_LABELS[key] || key;
        let detail = null;
        if (key === 'meta_desc_short' || key === 'meta_desc_long') detail = `${entry.meta_desc_len ?? 0} chars`;
        if (key === 'thin_content') detail = `${entry.content_length ?? 0} chars`;
        if (key === 'multiple_h1') detail = `${entry.h1_count ?? 0} H1s`;
        contentFlags.push({
          type: key,
          label,
          detail,
          recommendation: CONTENT_RECOMMENDATIONS[key] || '',
        });
      }
    });
    const securityFindings = (data.security_findings || []).filter((item) => item.url === url);

    const allRecommendations = new Set();
    seoIssues.forEach((iss) => {
      const rec = SEO_ISSUE_RECOMMENDATIONS[iss.type];
      if (rec) allRecommendations.add(rec);
    });
    contentFlags.forEach((f) => {
      if (f.recommendation) allRecommendations.add(f.recommendation);
    });
    categoryIssues.forEach((iss) => {
      if (iss.recommendation) allRecommendations.add(iss.recommendation);
    });
    securityFindings.forEach((f) => {
      if (f.recommendation) allRecommendations.add(f.recommendation);
    });
    const recommendations = [...allRecommendations];

    return {
      broken,
      redirects,
      seoIssues,
      categoryIssues,
      contentFlags,
      securityFindings,
      recommendations,
    };
  }, [inspectorUrl, data]);

  return (
    <PageLayout className="flex flex-col h-full">
      {inspectorUrl == null ? (
        <>
          <div className="mb-6 flex justify-between items-end shrink-0 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Link Explorer</h1>
              <p className="text-slate-400">
                Analyze discovered URLs. Showing <span className="font-bold text-white">{filtered.length.toLocaleString()}</span> results.
              </p>
            </div>
            <div className="flex gap-2">
              <select
                value={inlinksFilter}
                onChange={(e) => { setInlinksFilter(e.target.value); setPage(1); }}
                className={selectClass}
              >
                <option value="All">All pages</option>
                <option value="Orphans">Orphans (0 inlinks)</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className={selectClass}
              >
                <option value="All">All Status Codes</option>
                <option value="200">200 OK</option>
                <option value="404">404 Not Found</option>
                <option value="301">301 Redirect</option>
                <option value="302">302 Redirect</option>
              </select>
            </div>
          </div>
          <Card overflowHidden padding="none" className="flex flex-col flex-1 min-h-[500px]">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-brand-900 text-slate-400 uppercase text-xs font-semibold sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th
                      className="px-6 py-4 cursor-pointer hover:text-white"
                      onClick={() => toggleSort('url')}
                    >
                      URL Path
                    </th>
                    <th
                      className="px-6 py-4 cursor-pointer hover:text-white"
                      onClick={() => toggleSort('status')}
                    >
                      Status
                    </th>
                    <th
                      className="px-6 py-4 cursor-pointer hover:text-white"
                      onClick={() => toggleSort('inlinks')}
                    >
                      Inlinks
                    </th>
                    <th
                      className="px-6 py-4 cursor-pointer hover:text-white"
                      onClick={() => toggleSort('depth')}
                    >
                      Depth
                    </th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {pageLinks.map((link, i) => (
                    <tr key={i} className="hover:bg-brand-900/50 transition-colors">
                      <td className="px-6 py-3 font-mono text-blue-400 text-xs truncate max-w-[400px]" title={link.url}>
                        <a href={link.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {link.url}
                        </a>
                      </td>
                      <td className="px-6 py-3">
                        <Badge value={link.status ?? ''} />
                      </td>
                      <td className="px-6 py-3 text-slate-300 font-mono text-xs">{link.inlinks ?? 0}</td>
                      <td className="px-6 py-3 text-slate-300 font-mono text-xs">{depthVal(link)}</td>
                      <td className="px-6 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setInspectorUrl(link.url)}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-white bg-slate-800 px-2 py-1 rounded text-xs transition-colors"
                        >
                          <Search className="h-3 w-3" /> Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-700 bg-brand-900 flex justify-between items-center shrink-0">
              <div className="text-sm text-slate-400">
                Page <span className="font-bold text-white">{page}</span> of <span className="font-bold text-white">{totalPages}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-slate-300"
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-slate-300"
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <>
          <div className="mb-6 flex justify-between items-center shrink-0 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => setInspectorUrl(null)}
                className="inline-flex items-center gap-2 text-slate-300"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Link Explorer
              </Button>
            </div>
            <h1 id="url-inspector-title" className="text-3xl font-bold text-white flex items-center gap-2">
              <LinkIcon className="h-8 w-8 text-blue-500 shrink-0" /> URL Inspector
            </h1>
          </div>
          <Card padding="none" overflowHidden className="flex flex-col flex-1 min-h-0">
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="bg-brand-900 border border-slate-700 p-4 rounded-xl break-all font-mono text-blue-400 text-sm">
                {inspectorUrl}
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Overview</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-brand-900 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs text-slate-500">Indexability</div>
                    <div className="text-lg font-bold text-green-400">{indexability}</div>
                  </div>
                  <div className="bg-brand-900 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs text-slate-500">Inlinks</div>
                    <div className="text-lg font-bold text-white">
                      {linkForInspector?.inlinks != null ? linkForInspector.inlinks : '—'}
                    </div>
                  </div>
                  <div className="bg-brand-900 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs text-slate-500">Word Count</div>
                    <div className="text-lg font-bold text-white">
                      {linkForInspector?.content_length != null ? linkForInspector.content_length.toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
                {linkForInspector?.title != null && (
                  <div className="mt-4 bg-brand-900 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs text-slate-500">Title</div>
                    <div className="text-slate-200">{linkForInspector.title || '—'}</div>
                    {linkForInspector.title && (
                      <div className="text-xs text-slate-500 mt-1">
                        {linkForInspector.title.length} chars (aim 30–60)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {inspectorDetails && (
                <>
                  <div>
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">What&apos;s wrong</h2>
                    <Card className="bg-brand-900/50 border border-slate-700">
                      {inspectorDetails.broken.length + inspectorDetails.redirects.length + inspectorDetails.seoIssues.length + inspectorDetails.categoryIssues.length + inspectorDetails.contentFlags.length + inspectorDetails.securityFindings.length === 0 ? (
                        <p className="text-slate-500 py-2">No issues found for this URL.</p>
                      ) : (
                        <ul className="space-y-2 list-none p-0 m-0">
                          {inspectorDetails.broken.map((item, i) => (
                            <li key={`b-${i}`} className="flex items-center gap-2 flex-wrap">
                              <Badge value={item.status ?? 'Error'} />
                              <span className="text-slate-200">Broken or error response</span>
                            </li>
                          ))}
                          {inspectorDetails.redirects.map((item, i) => (
                            <li key={`r-${i}`} className="flex items-center gap-2 flex-wrap">
                              <Badge value={item.status ?? '3xx'} />
                              <span className="text-slate-200">Redirect</span>
                              {item.final_url && (
                                <span className="text-slate-500 text-xs font-mono truncate max-w-md" title={item.final_url}>
                                  → {item.final_url}
                                </span>
                              )}
                            </li>
                          ))}
                          {inspectorDetails.seoIssues.map((item, i) => (
                            <li key={`s-${i}`} className="text-slate-200">{item.message}</li>
                          ))}
                          {inspectorDetails.contentFlags.map((item, i) => (
                            <li key={`c-${i}`} className="text-slate-200">
                              {item.label}
                              {item.detail != null && <span className="text-slate-500 ml-1">({item.detail})</span>}
                            </li>
                          ))}
                          {inspectorDetails.categoryIssues.map((item, i) => (
                            <li key={`cat-${i}`} className="flex items-center gap-2 flex-wrap">
                              <Badge value={item.priority || 'Medium'} />
                              <span className="text-xs text-slate-500">{item.category}</span>
                              <span className="text-slate-200">{item.message}</span>
                            </li>
                          ))}
                          {inspectorDetails.securityFindings.map((item, i) => (
                            <li key={`sec-${i}`} className="flex items-center gap-2 flex-wrap">
                              <Badge value={item.severity || 'Medium'} />
                              <span className="text-slate-200">{item.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>

                  <div>
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">What to improve</h2>
                    <Card className="bg-brand-900/50 border border-slate-700">
                      {inspectorDetails.recommendations.length === 0 ? (
                        <p className="text-slate-500 py-2">No specific improvements for this URL.</p>
                      ) : (
                        <ul className="space-y-2 list-disc list-inside text-slate-300 text-sm">
                          {inspectorDetails.recommendations.map((rec, i) => (
                            <li key={i}>{rec}</li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">SEO &amp; content</h2>
                      <Card className="bg-brand-900/50 border border-slate-700 p-4">
                        {inspectorDetails.seoIssues.length + inspectorDetails.contentFlags.length === 0 ? (
                          <p className="text-slate-500 text-sm">No SEO or content issues.</p>
                        ) : (
                          <ul className="space-y-1.5 list-none p-0 m-0 text-sm text-slate-300">
                            {inspectorDetails.seoIssues.map((item, i) => (
                              <li key={i}>{item.message}</li>
                            ))}
                            {inspectorDetails.contentFlags.map((item, i) => (
                              <li key={i}>{item.label}{item.detail != null ? ` (${item.detail})` : ''}</li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Technical</h2>
                      <Card className="bg-brand-900/50 border border-slate-700 p-4">
                        {inspectorDetails.broken.length + inspectorDetails.redirects.length === 0 &&
                        inspectorDetails.categoryIssues.filter((i) => (i.category || '').toLowerCase().includes('technical') || (i.category || '').toLowerCase().includes('seo')).length === 0 ? (
                          <p className="text-slate-500 text-sm">No technical issues.</p>
                        ) : (
                          <ul className="space-y-1.5 list-none p-0 m-0 text-sm text-slate-300">
                            {inspectorDetails.broken.map((item, i) => (
                              <li key={i}>Broken: {item.status}</li>
                            ))}
                            {inspectorDetails.redirects.map((item, i) => (
                              <li key={i}>Redirect {item.status}{item.final_url ? ` → ${item.final_url}` : ''}</li>
                            ))}
                            {inspectorDetails.categoryIssues
                              .filter((i) => (i.category || '').toLowerCase().includes('technical') || (i.category || '').toLowerCase().includes('seo'))
                              .map((item, i) => (
                                <li key={i}>{item.message}</li>
                              ))}
                          </ul>
                        )}
                      </Card>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Performance &amp; styling</h2>
                      <Card className="bg-brand-900/50 border border-slate-700 p-4">
                        {inspectorDetails.categoryIssues.filter(
                          (i) =>
                            (i.category || '').toLowerCase().includes('performance') ||
                            (i.category || '').toLowerCase().includes('accessibility') ||
                            (i.category || '').toLowerCase().includes('html')
                        ).length === 0 ? (
                          <p className="text-slate-500 text-sm">No performance or styling issues.</p>
                        ) : (
                          <ul className="space-y-1.5 list-none p-0 m-0 text-sm text-slate-300">
                            {inspectorDetails.categoryIssues
                              .filter(
                                (i) =>
                                  (i.category || '').toLowerCase().includes('performance') ||
                                  (i.category || '').toLowerCase().includes('accessibility') ||
                                  (i.category || '').toLowerCase().includes('html')
                              )
                              .map((item, i) => (
                                <li key={i}>{item.message}</li>
                              ))}
                          </ul>
                        )}
                      </Card>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Security</h2>
                      <Card className="bg-brand-900/50 border border-slate-700 p-4">
                        {inspectorDetails.securityFindings.length === 0 ? (
                          <p className="text-slate-500 text-sm">No security findings.</p>
                        ) : (
                          <ul className="space-y-1.5 list-none p-0 m-0 text-sm text-slate-300">
                            {inspectorDetails.securityFindings.map((item, i) => (
                              <li key={i}>
                                <span className="text-slate-500 font-medium">{item.severity}:</span> {item.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </PageLayout>
  );
}
