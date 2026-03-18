import { useState } from 'react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';

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
    <PageLayout>
      <PageHeader
        title="On-Page Content Analysis"
        subtitle="Review missing or duplicate Titles, Meta Descriptions, and H1 tags."
      />
      <Card overflowHidden shadow padding="none">
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
            <Table>
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase bg-brand-900">
                  <TableHeadCell className="px-6 py-4">URL</TableHeadCell>
                  <TableHeadCell className="px-6 py-4">Title</TableHeadCell>
                  {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                    <TableHeadCell className="px-6 py-4">Length</TableHeadCell>
                  )}
                  {filter === 'multiple_h1' && <TableHeadCell className="px-6 py-4">H1 Count</TableHeadCell>}
                  {filter === 'thin_content' && <TableHeadCell className="px-6 py-4">Chars</TableHeadCell>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {list.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-blue-400 text-xs break-all">
                      <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {item.url}
                      </a>
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">{item.title ?? '—'}</TableCell>
                    {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                      <TableCell className="text-slate-300 font-mono">{item.meta_desc_len ?? '—'}</TableCell>
                    )}
                    {filter === 'multiple_h1' && (
                      <TableCell className="text-slate-300">{item.h1_count ?? '—'}</TableCell>
                    )}
                    {filter === 'thin_content' && (
                      <TableCell className="text-slate-300 font-mono">{item.content_length ?? '—'}</TableCell>
                    )}
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </PageLayout>
  );
}
