import { describe, expect, it } from 'vitest';
import type { ReportLink, ReportPayload } from '@/types/report';
import {
  buildTopConsoleSummary,
  buildTopConsoleSummaryFromRows,
  buildTopExceptionSummaryFromRows,
  computeBrowserErrorStats,
  flattenBrowserErrorsForTable,
  formatBrowserErrorSource,
  formatPagesAffectedStat,
  getBrowserDiagnosticsScope,
  getLinksWithBrowserErrors,
  linkBrowserCounts,
  linkHasBrowserErrors,
  linksInspectHref,
} from '@/lib/browserErrors';

const linkWithConsoleError: ReportLink = {
  url: 'https://example.com/a',
  has_browser_errors: true,
  console_error_count: 1,
  page_analysis: {
    browser: {
      console: [
        { level: 'error', text: 'Failed to load', source_url: 'https://example.com/app.js', line: 42 },
        { level: 'warning', text: 'Deprecated API', source_url: 'https://example.com/old.js', line: 1 },
      ],
      page_errors: [],
      summary: { console_error_count: 1, page_error_count: 0 },
    },
  },
};

const linkWithException: ReportLink = {
  url: 'https://example.com/b',
  has_browser_errors: true,
  page_error_count: 1,
  page_analysis: {
    browser: {
      console: [],
      page_errors: [{ message: 'Uncaught TypeError: x is not a function', stack: 'at foo (app.js:10)' }],
      summary: { console_error_count: 0, page_error_count: 1 },
    },
  },
};

const linkWithFailedRequest: ReportLink = {
  url: 'https://example.com/d',
  page_analysis: {
    browser: {
      console: [],
      page_errors: [],
      failed_requests: [{ url: 'https://cdn.example.com/app.js', failure: 'net::ERR_BLOCKED_BY_CLIENT' }],
      summary: { console_error_count: 0, page_error_count: 0, failed_request_count: 1 },
    },
  },
};

const ghostLink: ReportLink = {
  url: 'https://example.com/ghost',
  has_browser_errors: true,
  console_error_count: 0,
  page_error_count: 0,
  page_analysis: {
    browser: {
      console: [],
      page_errors: [],
      summary: { console_error_count: 0, page_error_count: 0 },
    },
  },
};

const cleanLink: ReportLink = {
  url: 'https://example.com/c',
  has_browser_errors: false,
  page_analysis: {
    browser: {
      console: [{ level: 'info', text: 'ready' }],
      page_errors: [],
      summary: { console_error_count: 0, page_error_count: 0 },
    },
  },
};

const mismatchLink: ReportLink = {
  url: 'https://example.com/mismatch',
  console_error_count: 9,
  page_analysis: {
    browser: {
      console: [{ level: 'error', text: 'Actual error' }],
      page_errors: [],
      summary: { console_error_count: 9, page_error_count: 0 },
    },
  },
};

describe('browserErrors', () => {
  it('detects links with browser errors from stored arrays, not stale flags', () => {
    expect(linkHasBrowserErrors(linkWithConsoleError)).toBe(true);
    expect(linkHasBrowserErrors(linkWithException)).toBe(true);
    expect(linkHasBrowserErrors(linkWithFailedRequest)).toBe(true);
    expect(linkHasBrowserErrors(ghostLink)).toBe(false);
    expect(linkHasBrowserErrors(cleanLink)).toBe(false);
  });

  it('counts errors from browser arrays instead of summary fields', () => {
    expect(linkBrowserCounts(mismatchLink)).toEqual({
      consoleErrors: 1,
      pageErrors: 0,
      failedRequests: 0,
    });
  });

  it('reads diagnostics scope from report payload', () => {
    const data: ReportPayload = {
      report_meta: {
        crawl_scope: {
          render_mode: 'javascript',
          browser_diagnostics: {
            pages_with_console_errors: 2,
            total_console_errors: 3,
          },
        },
      },
    };
    const scope = getBrowserDiagnosticsScope(data);
    expect(scope.renderMode).toBe('javascript');
    expect(scope.usesBrowser).toBe(true);
    expect(scope.browserDiagnostics?.pages_with_console_errors).toBe(2);
  });

  it('treats static crawl as non-browser', () => {
    const scope = getBrowserDiagnosticsScope({
      report_meta: { crawl_scope: { render_mode: 'static' } },
    });
    expect(scope.usesBrowser).toBe(false);
  });

  it('filters and sorts links with errors by array counts', () => {
    const links = getLinksWithBrowserErrors([
      cleanLink,
      ghostLink,
      linkWithConsoleError,
      mismatchLink,
      linkWithException,
      linkWithFailedRequest,
    ]);
    expect(links.map((l) => l.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/d',
      'https://example.com/mismatch',
    ]);
  });

  it('flattens console errors, exceptions, and failed requests into table rows', () => {
    const rows = flattenBrowserErrorsForTable([
      linkWithConsoleError,
      linkWithException,
      linkWithFailedRequest,
      cleanLink,
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      url: 'https://example.com/a',
      type: 'console',
      message: 'Failed to load',
      source_url: 'https://example.com/app.js',
      line: 42,
    });
    expect(rows[1]).toMatchObject({
      url: 'https://example.com/b',
      type: 'exception',
      message: 'Uncaught TypeError: x is not a function',
      stack: 'at foo (app.js:10)',
    });
    expect(rows[2]).toMatchObject({
      url: 'https://example.com/d',
      type: 'failed_request',
      message: 'net::ERR_BLOCKED_BY_CLIENT',
      source_url: 'https://cdn.example.com/app.js',
    });
  });

  it('computes unified stats from link arrays', () => {
    const stats = computeBrowserErrorStats([
      linkWithConsoleError,
      linkWithException,
      linkWithFailedRequest,
      cleanLink,
      ghostLink,
    ]);
    expect(stats.totalConsole).toBe(1);
    expect(stats.totalExceptions).toBe(1);
    expect(stats.totalFailedRequests).toBe(1);
    expect(stats.pagesWithConsole).toBe(1);
    expect(stats.pagesWithExceptions).toBe(1);
    expect(stats.pagesWithFailedRequests).toBe(1);
    expect(stats.affectedPages).toBe(3);
    expect(stats.allRows).toHaveLength(3);
  });

  it('builds top summaries from flattened rows', () => {
    const duplicateException: ReportLink = {
      url: 'https://example.com/e2',
      page_analysis: {
        browser: {
          page_errors: [{ message: 'Uncaught TypeError: x is not a function' }],
        },
      },
    };
    const rows = flattenBrowserErrorsForTable([linkWithConsoleError, linkWithException, duplicateException]);
    expect(buildTopConsoleSummaryFromRows(rows)).toEqual([
      {
        text: 'Failed to load',
        count: 1,
        sample_urls: ['https://example.com/a'],
      },
    ]);
    expect(buildTopExceptionSummaryFromRows(rows)).toEqual([
      {
        text: 'Uncaught TypeError: x is not a function',
        count: 2,
        sample_urls: ['https://example.com/b', 'https://example.com/e2'],
      },
    ]);
  });

  it('builds top console summary from scope aggregate', () => {
    const rows = buildTopConsoleSummary({
      top_console_messages: [
        { text: 'Same error', count: 5, sample_urls: ['https://a.com/1', 'https://a.com/2'] },
      ],
    });
    expect(rows).toEqual([
      { text: 'Same error', count: 5, sample_urls: ['https://a.com/1', 'https://a.com/2'] },
    ]);
  });

  it('formats pages affected with percentage', () => {
    expect(formatPagesAffectedStat(3, 80)).toBe('3 / 80 (4%)');
    expect(formatPagesAffectedStat(0, 0)).toBe('0');
  });

  it('formats source location', () => {
    expect(formatBrowserErrorSource('https://x.com/a.js', 10)).toBe('https://x.com/a.js:10');
    expect(formatBrowserErrorSource(undefined)).toBe('—');
  });

  it('builds links inspect href with tab', () => {
    expect(linksInspectHref('https://example.com/page', 'analysis')).toBe(
      '/links?inspect=https%3A%2F%2Fexample.com%2Fpage&tab=analysis',
    );
  });
});
