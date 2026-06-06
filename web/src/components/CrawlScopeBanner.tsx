import { AlertTriangle } from 'lucide-react';
import { strings, format } from '@/lib/strings';
import type { ReportPayload } from '@/types/report';

export default function CrawlScopeBanner({ data }: { data: ReportPayload | null | undefined }) {
  const cs = strings.views.overview.crawlScope;
  const scope = (data?.report_meta as { crawl_scope?: Record<string, unknown> } | undefined)?.crawl_scope;
  if (!scope) return null;

  const pages = Number(scope.pages_crawled ?? 0);
  const max = Number(scope.max_pages_configured ?? 0);
  const blocked = Number(scope.robots_blocked_count ?? 0);
  const limited = Boolean(scope.crawl_limited);
  const renderMode = String(scope.render_mode ?? 'static');
  const jsConcurrency = scope.js_concurrency != null ? Number(scope.js_concurrency) : null;
  const pagesStatic = scope.pages_static != null ? Number(scope.pages_static) : null;
  const pagesRendered = scope.pages_rendered != null ? Number(scope.pages_rendered) : null;
  const browserDiag = scope.browser_diagnostics as
    | {
        pages_with_console_errors?: number;
        pages_with_page_errors?: number;
        total_console_errors?: number;
      }
    | undefined;
  const pagesWithConsoleErrors = Number(browserDiag?.pages_with_console_errors ?? 0);
  const totalConsoleErrors = Number(browserDiag?.total_console_errors ?? 0);
  const pagesWithPageErrors = Number(browserDiag?.pages_with_page_errors ?? 0);

  return (
    <div
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
      role="status"
    >
      <div className="flex gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{cs.title}</p>
          <p>
            {format(cs.pagesLine, { pages: pages.toLocaleString(), max: max.toLocaleString() })}
            {limited ? ` ${cs.limitedNote}` : ''}
          </p>
          {blocked > 0 ? (
            <p>{format(cs.robotsLine, { count: blocked.toLocaleString() })}</p>
          ) : null}
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
            {renderMode === 'javascript'
              ? cs.javascriptNote
              : renderMode === 'auto'
                ? cs.autoNote
                : cs.staticHtmlNote}
          </p>
          {renderMode !== 'static' && jsConcurrency != null && jsConcurrency > 0 ? (
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
              {format(cs.jsConcurrencyLine, { count: jsConcurrency.toLocaleString() })}
            </p>
          ) : null}
          {renderMode === 'auto' &&
          pagesStatic != null &&
          pagesRendered != null &&
          (pagesStatic > 0 || pagesRendered > 0) ? (
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
              {format(cs.fetchMethodMixLine, {
                staticCount: pagesStatic.toLocaleString(),
                renderedCount: pagesRendered.toLocaleString(),
              })}
            </p>
          ) : null}
          {pagesWithConsoleErrors > 0 ? (
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
              {format(cs.browserConsoleErrorsLine, {
                pages: pagesWithConsoleErrors.toLocaleString(),
                errors: totalConsoleErrors.toLocaleString(),
              })}
            </p>
          ) : null}
          {pagesWithPageErrors > 0 ? (
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
              {format(cs.browserPageErrorsLine, {
                pages: pagesWithPageErrors.toLocaleString(),
              })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
