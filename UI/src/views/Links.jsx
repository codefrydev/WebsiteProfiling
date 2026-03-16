import { useState, useMemo, useEffect } from 'react';
import { Search, Link as LinkIcon, X } from 'lucide-react';
import { useReport } from '../context/useReport';

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
  const statusCls = (status) =>
    String(status).match(/^2/) ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400';

  const linkForInspector = inspectorUrl ? (links.find((l) => l.url === inspectorUrl) || null) : null;
  const indexability = !linkForInspector ? 'Unknown' : String(linkForInspector.status).match(/^2/) ? 'Indexable' : String(linkForInspector.status).match(/^[45]/) ? 'Not indexable' : 'Unknown';

  return (
    <div className="p-6 lg:p-8 flex flex-col h-full">
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
            className="bg-brand-800 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 outline-none"
          >
            <option value="All">All pages</option>
            <option value="Orphans">Orphans (0 inlinks)</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-brand-800 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 outline-none"
          >
            <option value="All">All Status Codes</option>
            <option value="200">200 OK</option>
            <option value="404">404 Not Found</option>
            <option value="301">301 Redirect</option>
            <option value="302">302 Redirect</option>
          </select>
        </div>
      </div>
      <div className="bg-brand-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col flex-1 min-h-[500px]">
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
                    <span className={`px-2 py-1 rounded text-xs font-bold ${statusCls(link.status)}`}>
                      {String(link.status ?? '')}
                    </span>
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
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {inspectorUrl != null && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:hidden"
          onClick={() => setInspectorUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="url-inspector-title"
        >
          <div
            className="bg-brand-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-brand-900/50">
              <h2 id="url-inspector-title" className="text-xl font-bold text-white flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-blue-500 shrink-0" /> URL Inspector
              </h2>
              <button
                type="button"
                onClick={() => setInspectorUrl(null)}
                className="text-slate-500 hover:text-white transition-colors p-1"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="bg-brand-900 border border-slate-700 p-4 rounded-lg break-all font-mono text-blue-400 text-sm">
                {inspectorUrl}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-brand-900 p-4 rounded border border-slate-700">
                  <div className="text-xs text-slate-500">Indexability</div>
                  <div className="text-lg font-bold text-green-400">{indexability}</div>
                </div>
                <div className="bg-brand-900 p-4 rounded border border-slate-700">
                  <div className="text-xs text-slate-500">Inlinks</div>
                  <div className="text-lg font-bold text-white">
                    {linkForInspector?.inlinks != null ? linkForInspector.inlinks : '—'}
                  </div>
                </div>
                <div className="bg-brand-900 p-4 rounded border border-slate-700">
                  <div className="text-xs text-slate-500">Word Count</div>
                  <div className="text-lg font-bold text-white">
                    {linkForInspector?.content_length != null ? linkForInspector.content_length.toLocaleString() : '—'}
                  </div>
                </div>
              </div>
              {linkForInspector?.title && (
                <div className="bg-brand-900 p-4 rounded border border-slate-700">
                  <div className="text-xs text-slate-500">Title</div>
                  <div className="text-slate-200">{linkForInspector.title}</div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-700 bg-brand-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectorUrl(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
