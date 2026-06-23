import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import AlertBanner from '@/components/AlertBanner';
import { strings, format } from '@/lib/strings';
import type { ReportPayload } from '@/types/report';
import { javascriptErrorsViewHref } from '@/lib/browserErrors';

export default function CrawlScopeBanner({ data }: { data: ReportPayload | null | undefined }) {
  const cs = strings.views.overview.crawlScope;
  const [searchParams] = useSearchParams();
  const trailingQuery = searchParams.toString();
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
  const showJsErrorsLink = pagesWithConsoleErrors > 0 || pagesWithPageErrors > 0;

  const pagesSummary = format(cs.pagesLine, { pages: pages.toLocaleString(), max: max.toLocaleString() });

  return (
    <AlertBanner
      variant="warning"
      collapsible
      defaultOpen
      title={
        <>
          <span>{cs.title}</span>
          <span className="font-normal opacity-90">
            {' — '}
            {pagesSummary}
            {limited ? ' · limit reached' : ''}
          </span>
        </>
      }
      icon={<AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
    >
      {limited ? <p>{cs.limitedNote}</p> : null}
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
      {showJsErrorsLink ? (
        <p className="text-xs pt-1">
          <Link
            to={javascriptErrorsViewHref(trailingQuery)}
            className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950 dark:text-amber-100 dark:hover:text-white"
          >
            {cs.viewJavaScriptErrors}
          </Link>
        </p>
      ) : null}
    </AlertBanner>
  );
}
