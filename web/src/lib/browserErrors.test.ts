import { describe, expect, it } from 'vitest';
import type { ReportLink, ReportPayload } from '@/types/report';
import {
  buildTopConsoleSummary,
  flattenBrowserErrorsForTable,
  formatBrowserErrorSource,
  getBrowserDiagnosticsScope,
  getLinksWithBrowserErrors,
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

describe('browserErrors', () => {
  it('detects links with browser errors', () => {
    expect(linkHasBrowserErrors(linkWithConsoleError)).toBe(true);
    expect(linkHasBrowserErrors(linkWithException)).toBe(true);
    expect(linkHasBrowserErrors(cleanLink)).toBe(false);
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

  it('filters and sorts links with errors', () => {
    const links = getLinksWithBrowserErrors([cleanLink, linkWithConsoleError, linkWithException]);
    expect(links.map((l) => l.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('flattens console errors and exceptions into table rows', () => {
    const rows = flattenBrowserErrorsForTable([linkWithConsoleError, linkWithException, cleanLink]);
    expect(rows).toHaveLength(2);
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
