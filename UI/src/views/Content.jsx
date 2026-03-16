import { useState } from 'react';
import { useReport } from '../context/useReport';

const CONTENT_FILTERS = [
  { key: 'missing_h1', label: 'Missing H1' },
  { key: 'missing_title', label: 'Missing Titles' },
  { key: 'multiple_h1', label: 'Multiple H1s' },
  { key: 'missing_meta_desc', label: 'Missing Meta Desc' },
  { key: 'meta_desc_short', label: 'Meta Desc Short' },
  { key: 'meta_desc_long', label: 'Meta Desc Long' },
  { key: 'thin_content', label: 'Thin Content' },
];

export default function Content({ searchQuery = '' }) {
  const { data } = useReport();
  const [filter, setFilter] = useState('missing_h1');

  if (!data) return null;

  const contentUrls = data.content_urls || {};
  let list = contentUrls[filter] || [];
  const q = (searchQuery || '').toLowerCase();
  if (q) list = list.filter((item) => (item.url || '').toLowerCase().includes(q));

  const getCount = (key) => (contentUrls[key] || []).length;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">On-Page Content Analysis</h1>
        <p className="text-slate-400">
          Review missing or duplicate Titles, Meta Descriptions, and H1 tags.
        </p>
      </div>
      <div className="bg-brand-800 border border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-700 bg-brand-900/50 flex gap-4 flex-wrap">
          {CONTENT_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                filter === key
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
              }`}
            >
              {label} ({getCount(key)})
            </button>
          ))}
        </div>
        <div className="p-6">
          {list.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No URLs in this category.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-400 uppercase">
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Title</th>
                    {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                      <th className="px-4 py-3">Length</th>
                    )}
                    {filter === 'multiple_h1' && <th className="px-4 py-3">H1 Count</th>}
                    {filter === 'thin_content' && <th className="px-4 py-3">Chars</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {list.map((item, i) => (
                    <tr key={i} className="border-t border-slate-700/50">
                      <td className="px-4 py-3 font-mono text-blue-400 text-xs break-all">
                        <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {item.url}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-sm">{item.title ?? '—'}</td>
                      {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                        <td className="px-4 py-3 text-slate-300 font-mono">{item.meta_desc_len ?? '—'}</td>
                      )}
                      {filter === 'multiple_h1' && (
                        <td className="px-4 py-3 text-slate-300">{item.h1_count ?? '—'}</td>
                      )}
                      {filter === 'thin_content' && (
                        <td className="px-4 py-3 text-slate-300 font-mono">{item.content_length ?? '—'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
