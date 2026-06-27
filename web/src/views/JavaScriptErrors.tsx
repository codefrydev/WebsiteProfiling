
import { useMemo, useState, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Bug, ChevronDown, ChevronRight, ExternalLink, BarChart3, List } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { strings, format } from '../lib/strings';
import { metricHelpHint } from '@/lib/metricHelp';
import { PageLayout, PageHeader, Card, Button, StatCard, Select, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, ViewTabs, ViewTabPanel } from '../components';
import { paginateSlice, PAGE_SIZE } from '@/components/google/tableUtils';
import type { ViewTabItem } from '../components';
import type { ViewProps } from '@/types';
import {
  buildTopConsoleSummary,
  flattenBrowserErrorsForTable,
  formatBrowserErrorSource,
  getBrowserDiagnosticsScope,
  getLinksWithBrowserErrors,
  linksInspectHref,
  type FlatBrowserErrorRow,
} from '@/lib/browserErrors';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import BrowserErrorsPromptGenerator from '@/components/issues/BrowserErrorsPromptGenerator';
import { buildBrowserErrorContext, buildBrowserErrorSummaryContext } from '@/lib/fixSuggestionContext';

type TypeFilter = 'All' | 'console' | 'exception';
const JS_ERRORS_TABS = ['summary', 'errors'] as const;
type JsErrorsTabId = (typeof JS_ERRORS_TABS)[number];

export default function JavaScriptErrors({ searchQuery = '' }: ViewProps) {
  const { data } = useReport();
  const domain = data?.site_name || '';
  useSectionData('links');
  const linksReady = useSectionsViewReady(['links']);
  const [searchParams] = useSearchParams();
  const trailingQuery = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [errorsPage, setErrorsPage] = useState(1);
  const [activeTab, setActiveTab] = useUrlTab(JS_ERRORS_TABS, 'summary');

  const vj = strings.views.javascriptErrors;
  const vjp = vj.pagination;
  const q = (searchQuery || '').toLowerCase().trim();

  const scopeInfo = useMemo(() => getBrowserDiagnosticsScope(data), [data]);
  const errorLinks = useMemo(() => getLinksWithBrowserErrors(data?.links), [data?.links]);
  const allRows = useMemo(() => flattenBrowserErrorsForTable(data?.links), [data?.links]);
  const topMessages = useMemo(
    () => buildTopConsoleSummary(scopeInfo.browserDiagnostics),
    [scopeInfo.browserDiagnostics],
  );

  const filteredRows = useMemo(() => {
    let rows: FlatBrowserErrorRow[] = allRows;
    if (typeFilter !== 'All') {
      rows = rows.filter((r) => r.type === typeFilter);
    }
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.url,
        r.message,
        r.source_url ?? '',
        r.stack ?? '',
        r.type,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, typeFilter, q]);

  const {
    slice: visibleRows,
    page: safeErrorsPage,
    totalPages: errorsTotalPages,
    total: filteredRowsTotal,
    from: errorsFrom,
    to: errorsTo,
  } = useMemo(
    () => paginateSlice(filteredRows, errorsPage, PAGE_SIZE),
    [filteredRows, errorsPage],
  );

  useEffect(() => {
    setErrorsPage(1);
    setExpandedRow(null);
  }, [typeFilter, q]);

  const tabItems = useMemo((): ViewTabItem[] => [
    {
      id: 'summary',
      label: vj.tabs.summary,
      icon: <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
      badge: topMessages.length > 0 ? topMessages.length : null,
    },
    {
      id: 'errors',
      label: vj.tabs.errors,
      icon: <List className="h-3.5 w-3.5 shrink-0" aria-hidden />,
      badge: filteredRows.length > 0 ? filteredRows.length : null,
    },
  ], [vj.tabs, topMessages.length, filteredRows.length]);

  if (!linksReady) {
    return <ViewSectionLoading title={vj.title} />;
  }

  const agg = scopeInfo.browserDiagnostics;
  const pagesWithConsole = Number(agg?.pages_with_console_errors ?? 0);
  const totalConsole = Number(agg?.total_console_errors ?? 0);
  const pagesWithExceptions = Number(agg?.pages_with_page_errors ?? 0);
  const totalExceptions = Number(agg?.total_page_errors ?? 0);
  const hasAnyErrors =
    allRows.length > 0
    || totalConsole > 0
    || totalExceptions > 0
    || pagesWithConsole > 0
    || pagesWithExceptions > 0;

  if (!scopeInfo.usesBrowser) {
    return (
      <PageLayout className="space-y-6">
        <PageHeader title={vj.title} subtitle={vj.subtitle} />
        <Card className="text-center py-12">
          <Bug className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-lg font-semibold text-foreground mb-2">{vj.emptyStaticTitle}</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6">{vj.emptyStaticBody}</p>
          <Link to="/pipeline">
            <Button variant="primary">{vj.runAudit}</Button>
          </Link>
        </Card>
      </PageLayout>
    );
  }

  if (!hasAnyErrors) {
    return (
      <PageLayout className="space-y-6">
        <PageHeader title={vj.title} subtitle={vj.subtitle} />
        <Card className="text-center py-12">
          <Bug className="h-12 w-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-4 opacity-80" />
          <h2 className="text-lg font-semibold text-foreground mb-2">{vj.emptyCleanTitle}</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">{vj.emptyCleanBody}</p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title={vj.title}
        subtitle={`${vj.subtitle} ${format(vj.subtitleCount, {
          count: allRows.length,
          pages: errorLinks.length,
        })}`}
        actions={
          <BrowserErrorsPromptGenerator
            domain={domain}
            rows={allRows}
            renderMode={scopeInfo.renderMode}
          />
        }
      />

      <ViewTabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as JsErrorsTabId)}
        ariaLabel={vj.title}
        idPrefix="javascript-errors"
      />

      {activeTab === 'summary' && (
        <ViewTabPanel idPrefix="javascript-errors" tabId="summary" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label={vj.consolePagesCard} value={pagesWithConsole.toLocaleString()} hint={metricHelpHint('views.jsErrors.consolePages')} />
            <StatCard label={vj.consoleTotalCard} value={totalConsole.toLocaleString()} hint={metricHelpHint('views.jsErrors.consoleTotal')} />
            <StatCard label={vj.exceptionPagesCard} value={pagesWithExceptions.toLocaleString()} hint={metricHelpHint('views.jsErrors.exceptionPages')} />
            <StatCard label={vj.exceptionTotalCard} value={totalExceptions.toLocaleString()} hint={metricHelpHint('views.jsErrors.exceptionTotal')} />
            <StatCard label={vj.renderMode} value={<span className="capitalize">{scopeInfo.renderMode}</span>} hint={metricHelpHint('views.jsErrors.renderMode')} />
          </div>

          {topMessages.length > 0 ? (
            <Card>
              <h2 className="text-sm font-bold text-foreground mb-1">{vj.topRecurring}</h2>
              <p className="text-xs text-muted-foreground mb-4">{vj.topRecurringHint}</p>
              <div className="border border-default rounded-xl overflow-hidden">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeadCell>{vj.thMessage}</TableHeadCell>
                      <TableHeadCell className="w-20">{vj.thCount}</TableHeadCell>
                      <TableHeadCell>{vj.thSampleUrls}</TableHeadCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {topMessages.map((row) => (
                      <TableRow key={row.text} className="align-top">
                        <TableCell className="font-mono text-xs break-all">
                          <div className="space-y-2">
                            <span>{row.text}</span>
                            <AiSuggestionButton
                              request={buildBrowserErrorSummaryContext(row.text, row.sample_urls, row.count)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.count.toLocaleString()}</TableCell>
                        <TableCell>
                          <ul className="space-y-1">
                            {row.sample_urls.map((url) => (
                              <li key={url}>
                                <Link
                                  to={linksInspectHref(url, 'analysis', trailingQuery.replace(/^\?/, ''))}
                                  className="text-link hover:underline font-mono text-xs break-all"
                                >
                                  {url}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-muted-foreground text-sm">{vj.emptyFiltered}</Card>
          )}
        </ViewTabPanel>
      )}

      {activeTab === 'errors' && (
        <ViewTabPanel idPrefix="javascript-errors" tabId="errors">
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">{vj.allErrors}</h2>
                <p className="text-xs text-muted-foreground">{vj.allErrorsHint}</p>
              </div>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                aria-label={vj.typeAll}
              >
                <option value="All">{vj.typeAll}</option>
                <option value="console">{vj.typeConsole}</option>
                <option value="exception">{vj.typeException}</option>
              </Select>
            </div>

            {filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{vj.emptyFiltered}</p>
            ) : (
              <>
                <div className="border border-default rounded-xl overflow-hidden">
                  <Table className="min-w-[720px]">
                    <TableHead>
                      <tr>
                        <TableHeadCell className="w-8" aria-hidden />
                        <TableHeadCell>{vj.thUrl}</TableHeadCell>
                        <TableHeadCell className="w-28">{vj.thType}</TableHeadCell>
                        <TableHeadCell>{vj.thMessage}</TableHeadCell>
                        <TableHeadCell className="w-48">{vj.thSource}</TableHeadCell>
                        <TableHeadCell className="w-32">{vj.thActions}</TableHeadCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {visibleRows.map((row) => {
                        const expanded = expandedRow === row.id;
                        const canExpand = row.type === 'exception' && Boolean(row.stack);
                        return (
                          <Fragment key={row.id}>
                            <TableRow className="align-top">
                              <TableCell className="px-2">
                                {canExpand ? (
                                  <button
                                    type="button"
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                    aria-expanded={expanded}
                                    onClick={() => setExpandedRow(expanded ? null : row.id)}
                                  >
                                    {expanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </button>
                                ) : null}
                              </TableCell>
                              <TableCell className="font-mono text-xs break-all">
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-link hover:underline inline-flex items-start gap-1"
                                >
                                  {row.url}
                                  <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                                </a>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground capitalize">
                                {row.type === 'console' ? vj.typeConsole : vj.typeException}
                              </TableCell>
                              <TableCell className="font-mono text-xs break-all">
                                <div className="space-y-2">
                                  <span>{row.message}</span>
                                  <AiSuggestionButton request={buildBrowserErrorContext(row)} />
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground break-all">
                                {formatBrowserErrorSource(row.source_url, row.line)}
                              </TableCell>
                              <TableCell>
                                <Link
                                  to={linksInspectHref(row.url, 'analysis', trailingQuery.replace(/^\?/, ''))}
                                  className="text-xs text-link hover:underline whitespace-nowrap"
                                >
                                  {vj.viewDetails}
                                </Link>
                              </TableCell>
                            </TableRow>
                            {expanded && row.stack ? (
                              <tr key={`${row.id}-stack`} className="border-b border-muted/60 bg-brand-900/50">
                                <td colSpan={6} className="px-4 py-3">
                                  <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                                    {row.stack}
                                  </pre>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {filteredRowsTotal > 0 ? (
                  <div className="mt-4 pt-4 border-t border-muted flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      <div>{format(vjp.showingSlice, { from: errorsFrom, to: errorsTo, total: filteredRowsTotal })}</div>
                      <div className="text-xs">
                        {vjp.pageOf}{' '}
                        <span className="font-bold text-bright tabular-nums">{safeErrorsPage}</span> {vjp.of}{' '}
                        <span className="font-bold text-bright tabular-nums">{errorsTotalPages}</span>
                        <span className="text-muted-foreground ml-2">
                          ({format(vjp.rowsPerPage, { n: PAGE_SIZE })})
                        </span>
                      </div>
                    </div>
                    {errorsTotalPages > 1 ? (
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setErrorsPage((p) => Math.max(1, p - 1));
                            setExpandedRow(null);
                          }}
                          disabled={safeErrorsPage <= 1}
                          className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                        >
                          {vjp.previous}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setErrorsPage((p) => Math.min(errorsTotalPages, p + 1));
                            setExpandedRow(null);
                          }}
                          disabled={safeErrorsPage >= errorsTotalPages}
                          className="px-3 py-1 text-foreground touch-manipulation min-h-11 sm:min-h-0"
                        >
                          {vjp.next}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </ViewTabPanel>
      )}
    </PageLayout>
  );
}
