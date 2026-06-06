import type {
  BrowserDiagnosticsAggregate,
  PageAnalysis,
  ReportLink,
  ReportPayload,
  TopConsoleMessage,
} from '@/types/report';

export type BrowserErrorRowType = 'console' | 'exception';

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

function pageAnalysisBrowser(link: ReportLink): PageAnalysis['browser'] | undefined {
  const pa = link.page_analysis;
  if (!pa || typeof pa !== 'object') return undefined;
  const browser = pa.browser;
  return browser && typeof browser === 'object' ? browser : undefined;
}

export function linkHasBrowserErrors(link: ReportLink): boolean {
  if (link.has_browser_errors) return true;
  if ((link.console_error_count ?? 0) > 0) return true;
  if ((link.page_error_count ?? 0) > 0) return true;
  const browser = pageAnalysisBrowser(link);
  if (!browser) return false;
  const summary = browser.summary;
  if (summary) {
    if ((summary.console_error_count ?? 0) > 0) return true;
    if ((summary.page_error_count ?? 0) > 0) return true;
  }
  const consoleMsgs = browser.console ?? [];
  if (consoleMsgs.some((m) => String(m.level ?? '').toLowerCase() === 'error')) return true;
  return (browser.page_errors?.length ?? 0) > 0;
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
    const aTotal = (a.console_error_count ?? 0) + (a.page_error_count ?? 0);
    const bTotal = (b.console_error_count ?? 0) + (b.page_error_count ?? 0);
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
  }

  return rows;
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
