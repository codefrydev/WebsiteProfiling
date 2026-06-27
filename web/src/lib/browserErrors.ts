import type {
  BrowserDiagnosticsAggregate,
  PageAnalysis,
  ReportLink,
  ReportPayload,
  TopConsoleMessage,
} from '@/types/report';

export type BrowserErrorRowType = 'console' | 'exception' | 'failed_request';

export interface BrowserDiagnosticsScope {
  renderMode: string;
  browserDiagnostics: BrowserDiagnosticsAggregate | null;
  usesBrowser: boolean;
}

export interface FlatBrowserErrorRow {
  id: string;
  url: string;
  type: BrowserErrorRowType;
  message: string;
  source_url?: string;
  line?: number;
  stack?: string;
}

export interface TopConsoleSummaryRow {
  text: string;
  count: number;
  sample_urls: string[];
}

export interface LinkBrowserCounts {
  consoleErrors: number;
  pageErrors: number;
  failedRequests: number;
}

export interface BrowserErrorStats {
  allRows: FlatBrowserErrorRow[];
  totalConsole: number;
  totalExceptions: number;
  totalFailedRequests: number;
  pagesWithConsole: number;
  pagesWithExceptions: number;
  pagesWithFailedRequests: number;
  affectedPages: number;
  totalPages: number;
}

function pageAnalysisBrowser(link: ReportLink): PageAnalysis['browser'] | undefined {
  const pa = link.page_analysis;
  if (!pa || typeof pa !== 'object') return undefined;
  const browser = pa.browser;
  return browser && typeof browser === 'object' ? browser : undefined;
}

export function linkBrowserCounts(link: ReportLink): LinkBrowserCounts {
  const browser = pageAnalysisBrowser(link);
  if (!browser) {
    return { consoleErrors: 0, pageErrors: 0, failedRequests: 0 };
  }

  const consoleErrors = (browser.console ?? []).filter(
    (m) => String(m.level ?? '').toLowerCase() === 'error',
  ).length;
  const pageErrors = (browser.page_errors ?? []).length;
  const failedRequests = (browser.failed_requests ?? []).length;

  return { consoleErrors, pageErrors, failedRequests };
}

export function linkHasBrowserErrors(link: ReportLink): boolean {
  const counts = linkBrowserCounts(link);
  return counts.consoleErrors + counts.pageErrors + counts.failedRequests > 0;
}

export function getBrowserDiagnosticsScope(
  data: ReportPayload | null | undefined,
): BrowserDiagnosticsScope {
  const scope = (data?.report_meta as { crawl_scope?: Record<string, unknown> } | undefined)?.crawl_scope;
  const renderMode = String(scope?.render_mode ?? 'static');
  const usesBrowser = renderMode === 'javascript' || renderMode === 'auto';
  const raw = scope?.browser_diagnostics;
  const browserDiagnostics =
    raw && typeof raw === 'object' ? (raw as BrowserDiagnosticsAggregate) : null;
  return { renderMode, browserDiagnostics, usesBrowser };
}

export function getLinksWithBrowserErrors(links: ReportLink[] | undefined): ReportLink[] {
  if (!links?.length) return [];
  return links.filter(linkHasBrowserErrors).sort((a, b) => {
    const aCounts = linkBrowserCounts(a);
    const bCounts = linkBrowserCounts(b);
    const aTotal = aCounts.consoleErrors + aCounts.pageErrors + aCounts.failedRequests;
    const bTotal = bCounts.consoleErrors + bCounts.pageErrors + bCounts.failedRequests;
    return bTotal - aTotal || String(a.url).localeCompare(String(b.url));
  });
}

export function flattenBrowserErrorsForTable(links: ReportLink[] | undefined): FlatBrowserErrorRow[] {
  if (!links?.length) return [];
  const rows: FlatBrowserErrorRow[] = [];

  for (const link of links) {
    const url = String(link.url ?? '').trim();
    if (!url) continue;
    const browser = pageAnalysisBrowser(link);
    if (!browser) continue;

    for (const [i, msg] of (browser.console ?? []).entries()) {
      if (String(msg.level ?? '').toLowerCase() !== 'error') continue;
      rows.push({
        id: `${url}::console::${i}`,
        url,
        type: 'console',
        message: String(msg.text ?? '').trim() || '—',
        source_url: msg.source_url,
        line: msg.line,
      });
    }

    for (const [i, err] of (browser.page_errors ?? []).entries()) {
      rows.push({
        id: `${url}::exception::${i}`,
        url,
        type: 'exception',
        message: String(err.message ?? '').trim() || '—',
        stack: err.stack,
      });
    }

    for (const [i, req] of (browser.failed_requests ?? []).entries()) {
      const failure = String(req.failure ?? '').trim();
      const reqUrl = String(req.url ?? '').trim();
      rows.push({
        id: `${url}::failed::${i}`,
        url,
        type: 'failed_request',
        message: failure || reqUrl || '—',
        source_url: reqUrl || undefined,
      });
    }
  }

  return rows;
}

function buildTopSummaryFromRows(
  rows: FlatBrowserErrorRow[],
  type: BrowserErrorRowType,
  limit = 5,
): TopConsoleSummaryRow[] {
  const buckets = new Map<string, { count: number; sample_urls: string[] }>();

  for (const row of rows) {
    if (row.type !== type) continue;
    const text = row.message.trim();
    if (!text || text === '—') continue;

    const bucket = buckets.get(text) ?? { count: 0, sample_urls: [] };
    bucket.count += 1;
    if (row.url && !bucket.sample_urls.includes(row.url) && bucket.sample_urls.length < 3) {
      bucket.sample_urls.push(row.url);
    }
    buckets.set(text, bucket);
  }

  return [...buckets.entries()]
    .map(([text, bucket]) => ({
      text,
      count: bucket.count,
      sample_urls: bucket.sample_urls,
    }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit);
}

export function buildTopConsoleSummaryFromRows(rows: FlatBrowserErrorRow[]): TopConsoleSummaryRow[] {
  return buildTopSummaryFromRows(rows, 'console');
}

export function buildTopExceptionSummaryFromRows(rows: FlatBrowserErrorRow[]): TopConsoleSummaryRow[] {
  return buildTopSummaryFromRows(rows, 'exception');
}

export function computeBrowserErrorStats(links: ReportLink[] | undefined): BrowserErrorStats {
  const allRows = flattenBrowserErrorsForTable(links);
  const pagesWithConsole = new Set<string>();
  const pagesWithExceptions = new Set<string>();
  const pagesWithFailedRequests = new Set<string>();

  for (const link of links ?? []) {
    const url = String(link.url ?? '').trim();
    if (!url) continue;
    const counts = linkBrowserCounts(link);
    if (counts.consoleErrors > 0) pagesWithConsole.add(url);
    if (counts.pageErrors > 0) pagesWithExceptions.add(url);
    if (counts.failedRequests > 0) pagesWithFailedRequests.add(url);
  }

  return {
    allRows,
    totalConsole: allRows.filter((row) => row.type === 'console').length,
    totalExceptions: allRows.filter((row) => row.type === 'exception').length,
    totalFailedRequests: allRows.filter((row) => row.type === 'failed_request').length,
    pagesWithConsole: pagesWithConsole.size,
    pagesWithExceptions: pagesWithExceptions.size,
    pagesWithFailedRequests: pagesWithFailedRequests.size,
    affectedPages: new Set(allRows.map((row) => row.url)).size,
    totalPages: links?.length ?? 0,
  };
}

export function formatPagesAffectedStat(pages: number, totalPages: number): string {
  if (totalPages <= 0) return pages.toLocaleString();
  const pct = Math.round((pages / totalPages) * 100);
  return `${pages.toLocaleString()} / ${totalPages.toLocaleString()} (${pct}%)`;
}

export function buildTopConsoleSummary(
  scope: BrowserDiagnosticsAggregate | null | undefined,
): TopConsoleSummaryRow[] {
  if (!scope?.top_console_messages?.length) return [];
  return scope.top_console_messages
    .map((item: TopConsoleMessage) => ({
      text: String(item.text ?? '').trim(),
      count: Number(item.count ?? 0),
      sample_urls: Array.isArray(item.sample_urls)
        ? item.sample_urls.filter((u): u is string => typeof u === 'string' && u.length > 0)
        : [],
    }))
    .filter((row) => row.text.length > 0);
}

export function formatBrowserErrorSource(sourceUrl?: string, line?: number): string {
  if (!sourceUrl) return '—';
  return line != null ? `${sourceUrl}:${line}` : sourceUrl;
}

export function linksInspectHref(url: string, tab?: string, trailingQuery = ''): string {
  const params = new URLSearchParams();
  params.set('inspect', url);
  if (tab) params.set('tab', tab);
  const base = `/links?${params.toString()}`;
  return trailingQuery ? `${base}${trailingQuery.startsWith('&') ? trailingQuery : `&${trailingQuery.replace(/^\?/, '')}`}` : base;
}

export function javascriptErrorsViewHref(trailingQuery = ''): string {
  const base = '/javascript-errors';
  if (!trailingQuery) return base;
  return trailingQuery.startsWith('?') ? `${base}${trailingQuery}` : `${base}?${trailingQuery.replace(/^\?/, '')}`;
}
