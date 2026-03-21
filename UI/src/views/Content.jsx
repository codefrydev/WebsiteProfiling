import { useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { ExternalLink, CheckCircle2, FileText } from 'lucide-react';
import { useReport } from '../context/useReport';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../components';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';

registerChartJsBase();

const CONTENT_FILTERS = [
  {
    key: 'missing_h1',
    label: 'Missing H1',
    guidance: 'Every page should have exactly one H1 tag that clearly describes the page content for both users and search engines.',
  },
  {
    key: 'missing_title',
    label: 'Missing Title',
    guidance: 'The <title> tag is a critical ranking signal. Missing titles result in poor click-through rates from search results.',
  },
  {
    key: 'multiple_h1',
    label: 'Multiple H1s',
    guidance: 'Having more than one H1 dilutes your heading hierarchy. Consolidate to a single, keyword-rich H1 per page.',
  },
  {
    key: 'missing_meta_desc',
    label: 'Missing Meta Desc',
    guidance: 'Meta descriptions influence click-through rates. Write a unique, compelling 120–160 character summary for each page.',
  },
  {
    key: 'meta_desc_short',
    label: 'Meta Desc Short',
    guidance: 'Meta descriptions under ~120 characters leave wasted SERP real estate. Expand them to be more descriptive and persuasive.',
  },
  {
    key: 'meta_desc_long',
    label: 'Meta Desc Long',
    guidance: 'Meta descriptions over ~160 characters get truncated in search results. Trim them down to the most impactful text.',
  },
  {
    key: 'thin_content',
    label: 'Thin Content',
    guidance: 'Pages with very little text (under ~300 words) are often low-value to search engines. Expand or consolidate thin pages.',
  },
];

export default function Content({ searchQuery = '' }) {
  const { data } = useReport();
  const [filter, setFilter] = useState('missing_h1');

  const contentUrls = useMemo(() => data?.content_urls ?? {}, [data?.content_urls]);

  const issueBarData = useMemo(() => {
    const labels = CONTENT_FILTERS.map((f) => f.label);
    const values = CONTENT_FILTERS.map((f) => (contentUrls[f.key] || []).length);
    return { labels, values };
  }, [contentUrls]);

  const issueBarOpts = useMemo(() => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} URL${n !== 1 ? 's' : ''}`;
            },
          },
        },
      },
    };
  }, []);

  if (!data) return null;

  const getCount = (key) => (contentUrls[key] || []).length;
  const totalIssues = CONTENT_FILTERS.reduce((sum, f) => sum + getCount(f.key), 0);

  let list = contentUrls[filter] || [];
  const q = (searchQuery || '').toLowerCase().trim();
  if (q) {
    list = list.filter((item) => {
      const url = (item.url || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      return url.includes(q) || title.includes(q);
    });
  }

  const activeFilter = CONTENT_FILTERS.find((f) => f.key === filter);

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="On-Page SEO"
        subtitle={`Audit missing or duplicate titles, meta descriptions, and H1 tags. ${totalIssues} total issue${totalIssues !== 1 ? 's' : ''} detected.`}
      />

      {totalIssues > 0 && (
        <Card padding="tight" shadow>
          <h2 className="text-sm font-bold text-slate-200 mb-1">Issues by type</h2>
          <p className="text-xs text-slate-500 mb-3">URL count per on-page issue category</p>
          <div className="h-[22rem]">
            <Bar
              data={{
                labels: issueBarData.labels,
                datasets: [{ data: issueBarData.values, backgroundColor: palette(issueBarData.labels.length) }],
              }}
              options={issueBarOpts}
            />
          </div>
        </Card>
      )}

      {/* Summary stat chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {CONTENT_FILTERS.map(({ key, label }) => {
          const count = getCount(key);
          const hasIssues = count > 0;
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`text-left rounded-xl border p-3 transition-all ${
                isActive
                  ? hasIssues
                    ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                    : 'bg-green-500/10 border-green-500/40 ring-1 ring-green-500/20'
                  : hasIssues
                  ? 'bg-brand-800 border-amber-700/40 hover:border-amber-600/60'
                  : 'bg-brand-800 border-default hover:border-slate-600/60 opacity-60'
              }`}
            >
              <div className={`text-xl font-bold ${hasIssues ? (isActive ? 'text-red-400' : 'text-amber-400') : 'text-green-400'}`}>
                {count}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 leading-tight">{label}</div>
            </button>
          );
        })}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap items-center">
        {CONTENT_FILTERS.map(({ key, label }) => {
          const count = getCount(key);
          const isActive = filter === key;
          const hasIssues = count > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                isActive
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : hasIssues
                  ? 'border-amber-700/50 bg-amber-500/10 text-amber-300 hover:border-amber-600/60'
                  : 'border-default bg-slate-800 text-slate-500 hover:border-slate-600/60'
              }`}
            >
              {hasIssues && !isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              )}
              {label}
              <span className={`text-xs font-bold ${isActive ? 'text-blue-300' : hasIssues ? 'text-amber-400' : 'text-slate-600'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Active filter guidance */}
      {activeFilter?.guidance && (
        <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
          <FileText className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-300 leading-relaxed">{activeFilter.guidance}</p>
        </div>
      )}

      {/* Table */}
      <Card overflowHidden shadow padding="none">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="text-slate-500 text-sm font-medium">No URLs affected by this issue.</p>
            <p className="text-xs text-slate-600">Great job — nothing to fix here.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-muted bg-brand-900/50 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{activeFilter?.label}</span>
              <span className="text-xs text-slate-500">{list.length} URL{list.length !== 1 ? 's' : ''}</span>
            </div>
            <Table>
              <TableHead sticky>
                <tr>
                  <TableHeadCell className="w-8 text-center">#</TableHeadCell>
                  <TableHeadCell className="min-w-[260px]">URL</TableHeadCell>
                  <TableHeadCell className="min-w-[160px]">Page Title</TableHeadCell>
                  {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                    <TableHeadCell className="w-20 text-center">Length</TableHeadCell>
                  )}
                  {filter === 'multiple_h1' && <TableHeadCell className="w-20 text-center">H1 Count</TableHeadCell>}
                  {filter === 'thin_content' && <TableHeadCell className="w-20 text-center">Chars</TableHeadCell>}
                  <TableHeadCell className="w-8" />
                </tr>
              </TableHead>
              <TableBody striped>
                {list.map((item, i) => (
                  <TableRow key={i} className="group">
                    <TableCell className="text-slate-600 text-xs font-mono text-center w-8">{i + 1}</TableCell>
                    <TableCell className="max-w-[320px]">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        title={item.url}
                        className="block font-mono text-blue-400 text-xs truncate hover:text-blue-300 hover:underline transition-colors"
                      >
                        {item.url}
                      </a>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="block text-slate-400 text-xs truncate" title={item.title ?? ''}>
                        {item.title ?? <span className="text-slate-600 italic">—</span>}
                      </span>
                    </TableCell>
                    {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                      <TableCell className="text-center w-20">
                        <span className={`font-mono text-sm font-bold tabular-nums ${
                          filter === 'meta_desc_short' ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {item.meta_desc_len ?? '—'}
                        </span>
                      </TableCell>
                    )}
                    {filter === 'multiple_h1' && (
                      <TableCell className="text-center w-20">
                        <span className="font-mono text-red-400 font-bold tabular-nums">{item.h1_count ?? '—'}</span>
                      </TableCell>
                    )}
                    {filter === 'thin_content' && (
                      <TableCell className="text-center w-20">
                        <span className="font-mono text-amber-400 font-bold tabular-nums">{item.content_length ?? '—'}</span>
                      </TableCell>
                    )}
                    <TableCell className="w-8">
                      <ExternalLink className="h-3.5 w-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>
    </PageLayout>
  );
}
