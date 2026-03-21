import { useState, useMemo, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { ExternalLink, CheckCircle2, FileText, Copy } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings, format } from '../lib/strings';
import { PageLayout, PageHeader, Card, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Button } from '../components';
import BrowserMlPanel from '../components/ml/BrowserMlPanel';
import { palette } from '../utils/chartPalette';
import { registerChartJsBase, barOptionsHorizontal } from '../utils/chartJsDefaults';
import { formatPageHrefLines } from '../utils/linkUtils';

registerChartJsBase();

export default function Content({ searchQuery = '' }) {
  const vc = strings.views.content;
  const sj = strings.common;
  const vlp = strings.views.links;
  const CONTENT_FILTERS = vc.filters;
  const { data } = useReport();
  const [filter, setFilter] = useState('missing_h1');
  const [page, setPage] = useState(1);
  const perPage = 50;

  const contentUrls = useMemo(() => data?.content_urls ?? {}, [data?.content_urls]);

  const list = useMemo(() => {
    let l = contentUrls[filter] || [];
    const qn = (searchQuery || '').toLowerCase().trim();
    if (qn) {
      l = l.filter((item) => {
        const url = (item.url || '').toLowerCase();
        const title = (item.title || '').toLowerCase();
        return url.includes(qn) || title.includes(qn);
      });
    }
    return l;
  }, [contentUrls, filter, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [filter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(list.length / perPage));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pageSlice = useMemo(
    () => list.slice((page - 1) * perPage, page * perPage),
    [list, page, perPage]
  );

  const rowFrom = list.length === 0 ? 0 : (page - 1) * perPage + 1;
  const rowTo = Math.min(page * perPage, list.length);

  const issueBarData = useMemo(() => {
    const labels = CONTENT_FILTERS.map((f) => f.label);
    const values = CONTENT_FILTERS.map((f) => (contentUrls[f.key] || []).length);
    return { labels, values };
  }, [contentUrls, CONTENT_FILTERS]);

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
              return ` ${n.toLocaleString()} ${n !== 1 ? 'URLs' : 'URL'}`;
            },
          },
        },
      },
    };
  }, []);

  const getCount = (key) => (contentUrls[key] || []).length;
  const totalIssues = useMemo(
    () => CONTENT_FILTERS.reduce((sum, f) => sum + (contentUrls[f.key] || []).length, 0),
    [contentUrls, CONTENT_FILTERS]
  );

  if (!data) return null;

  const activeFilter = CONTENT_FILTERS.find((f) => f.key === filter);

  const showMetricCol =
    filter === 'meta_desc_short' ||
    filter === 'meta_desc_long' ||
    filter === 'multiple_h1' ||
    filter === 'thin_content';

  const subtitle = `${vc.subtitlePrefix} ${format(vc.subtitleIssues, {
    count: totalIssues,
    word: totalIssues === 1 ? vc.issueWord : vc.issuesWord,
  })}`;

  const urlCountLine = `${list.length} ${list.length === 1 ? vc.urlOne : vc.urlMany}`;

  return (
    <PageLayout className="space-y-6">
      <PageHeader title={vc.title} subtitle={subtitle} />

      {Array.isArray(data?.links) && data.links.length > 0 && (
        <Card shadow>
          <BrowserMlPanel links={data.links} compact />
        </Card>
      )}

      {data.content_duplicates?.length > 0 && (
        <Card shadow>
          <div className="flex items-center gap-2 mb-3">
            <Copy className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-bold text-slate-200">{vc.dupClusters}</h2>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-muted">
            <Table>
              <TableHead sticky>
                <tr>
                  <TableHeadCell>{vc.colCluster}</TableHeadCell>
                  <TableHeadCell>{vc.colRepresentative}</TableHeadCell>
                  <TableHeadCell className="text-right">{vc.colUrls}</TableHeadCell>
                </tr>
              </TableHead>
              <TableBody striped>
                {(data.content_duplicates || []).slice(0, 40).map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-xs text-violet-300">{g.id}</TableCell>
                    <TableCell className="max-w-md">
                      <a
                        href={g.representative_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 text-xs font-mono hover:underline break-all"
                      >
                        {g.representative_url}
                      </a>
                    </TableCell>
                    <TableCell className="text-right text-slate-400 text-xs tabular-nums">
                      {g.member_count ?? (g.member_urls || []).length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {totalIssues > 0 && (
        <Card padding="tight" shadow>
          <h2 className="text-sm font-bold text-slate-200 mb-1">{vc.issuesByType}</h2>
          <p className="text-xs text-slate-500 mb-3">{vc.issuesByTypeHint}</p>
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

      {activeFilter?.guidance && (
        <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
          <FileText className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-300 leading-relaxed">{activeFilter.guidance}</p>
        </div>
      )}

      <Card overflowHidden shadow padding="none" className="flex flex-col">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="text-slate-500 text-sm font-medium">{vc.emptyFilter}</p>
            <p className="text-xs text-slate-600">{vc.emptyGreat}</p>
          </div>
        ) : (
          <>
            <div className="px-3 sm:px-4 py-3 border-b border-muted bg-brand-900/50 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{activeFilter?.label}</span>
                <span className="text-xs text-slate-500 shrink-0">{urlCountLine}</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{vc.issueTableHint}</p>
            </div>
            <Table className={showMetricCol ? 'min-w-[480px]' : 'min-w-[340px]'}>
              <TableHead sticky>
                <tr>
                  <TableHeadCell className="text-center sticky left-0 top-0 z-30 w-14 min-w-[3.5rem] bg-brand-900 border-r border-white/10 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)] px-3 sm:px-4">
                    #
                  </TableHeadCell>
                  <TableHeadCell className="text-left sticky left-14 top-0 z-30 min-w-0 bg-brand-900 border-r border-white/10 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)] px-3 sm:px-4">
                    {vc.tablePage}
                  </TableHeadCell>
                  {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                    <TableHeadCell className="hidden md:table-cell text-center px-3 sm:px-4">{vc.tableLength}</TableHeadCell>
                  )}
                  {filter === 'multiple_h1' && (
                    <TableHeadCell className="hidden md:table-cell text-center px-3 sm:px-4">{vc.tableH1Count}</TableHeadCell>
                  )}
                  {filter === 'thin_content' && (
                    <TableHeadCell className="hidden md:table-cell text-center px-3 sm:px-4">{vc.tableChars}</TableHeadCell>
                  )}
                </tr>
              </TableHead>
              <TableBody
                striped
                className="[&>tr>td:nth-child(1)]:sticky [&>tr>td:nth-child(1)]:left-0 [&>tr>td:nth-child(1)]:z-20 [&>tr>td:nth-child(1)]:w-14 [&>tr>td:nth-child(1)]:min-w-[3.5rem] [&>tr>td:nth-child(1)]:bg-inherit [&>tr>td:nth-child(1)]:border-r [&>tr>td:nth-child(1)]:border-white/10 [&>tr>td:nth-child(1)]:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)] [&>tr>td:nth-child(2)]:sticky [&>tr>td:nth-child(2)]:left-14 [&>tr>td:nth-child(2)]:z-20 [&>tr>td:nth-child(2)]:min-w-0 [&>tr>td:nth-child(2)]:bg-inherit [&>tr>td:nth-child(2)]:border-r [&>tr>td:nth-child(2)]:border-white/10 [&>tr>td:nth-child(2)]:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]"
              >
                {pageSlice.map((item, i) => {
                  const hrefLines = formatPageHrefLines(item.url);
                  const rowNum = (page - 1) * perPage + i + 1;
                  return (
                  <TableRow key={`${item.url}-${rowNum}`} className="group">
                    <TableCell className="text-slate-500 text-sm font-semibold tabular-nums text-center align-top pt-4 px-3 sm:px-4">
                      {rowNum}
                    </TableCell>
                    <TableCell className="min-w-0 align-top pt-3 px-3 sm:px-4">
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div
                          className="text-slate-100 font-medium text-sm leading-snug line-clamp-2"
                          title={item.title || undefined}
                        >
                          {item.title ? (
                            item.title
                          ) : (
                            <span className="text-slate-500 italic font-normal">{vc.noTitle}</span>
                          )}
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          title={item.url}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 group/link min-w-0"
                        >
                          <span className="truncate font-mono">{hrefLines.label}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover/link:opacity-100 transition-opacity" />
                        </a>
                        {showMetricCol && (
                          <p className="mt-1 md:hidden text-[11px] text-slate-500 leading-snug">
                            {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                              <span className={`font-semibold tabular-nums ${filter === 'meta_desc_short' ? 'text-amber-400' : 'text-red-400'}`}>
                                {vc.tableLength}: {item.meta_desc_len ?? sj.emDash}
                              </span>
                            )}
                            {filter === 'multiple_h1' && (
                              <span className="font-semibold tabular-nums text-red-400">
                                {vc.tableH1Count}: {item.h1_count ?? sj.emDash}
                              </span>
                            )}
                            {filter === 'thin_content' && (
                              <span className="font-semibold tabular-nums text-amber-400">
                                {vc.tableChars}: {item.content_length ?? sj.emDash}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    {(filter === 'meta_desc_short' || filter === 'meta_desc_long') && (
                      <TableCell className="hidden md:table-cell text-center align-middle px-3 sm:px-4">
                        <span className={`text-sm font-bold tabular-nums ${
                          filter === 'meta_desc_short' ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {item.meta_desc_len ?? sj.emDash}
                        </span>
                      </TableCell>
                    )}
                    {filter === 'multiple_h1' && (
                      <TableCell className="hidden md:table-cell text-center align-middle px-3 sm:px-4">
                        <span className="text-sm font-bold tabular-nums text-red-400">{item.h1_count ?? sj.emDash}</span>
                      </TableCell>
                    )}
                    {filter === 'thin_content' && (
                      <TableCell className="hidden md:table-cell text-center align-middle px-3 sm:px-4">
                        <span className="text-sm font-bold tabular-nums text-amber-400">{item.content_length ?? sj.emDash}</span>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="p-4 border-t border-muted bg-brand-900 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center shrink-0">
              <div className="text-sm text-slate-400 space-y-0.5">
                <div>{format(vc.showingSlice, { from: rowFrom, to: rowTo, total: list.length })}</div>
                <div>
                  {vlp.pageOf} <span className="font-bold text-bright">{page}</span> {vlp.of}{' '}
                  <span className="font-bold text-bright">{totalPages}</span>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-slate-300 touch-manipulation min-h-11 sm:min-h-0"
                >
                  {vlp.previous}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-slate-300 touch-manipulation min-h-11 sm:min-h-0"
                >
                  {vlp.next}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </PageLayout>
  );
}
