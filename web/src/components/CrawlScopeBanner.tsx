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
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80">{cs.staticHtmlNote}</p>
        </div>
      </div>
    </div>
  );
}
