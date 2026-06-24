
import { Fragment, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useReport } from '@/context/useReport';
import { useUrlInspector } from '@/context/UrlInspectorContext';
import { useSectionData } from '@/hooks/useSectionData';
import InspectorTabs from '@/components/links/InspectorTabs';
import { shortPath } from '@/lib/linkGraph';
import { strings } from '@/lib/strings';
import type { InspectorDetails, LinkDetail, ReportLink } from '@/types/report';

interface UrlInspectorDrawerProps {
  url: string | null;
  onClose: () => void;
}

function buildInspectorDetails(data: NonNullable<ReturnType<typeof useReport>['data']>, url: string, links: ReportLink[]): InspectorDetails {
  const issues = data.issues || {};
  const broken = (issues.broken || []).filter((i) => i.url === url).map((i) => ({ url: i.url ?? url, status: i.status }));
  const redirects = (issues.redirects || []).filter((i) => i.url === url).map((i) => ({
    url: i.url ?? url,
    status: i.status,
    final_url: typeof i.final_url === 'string' ? i.final_url : undefined,
  }));
  const seoIssues = (issues.seo || []).filter((i) => i.url === url).map((i) => ({
    url: i.url ?? url,
    type: i.type,
    message: i.message,
  }));
  const categoryIssues: InspectorDetails['categoryIssues'] = [];
  (data.categories || []).forEach((cat) => {
    (cat.issues || []).forEach((iss) => {
      if (iss.url === url) {
        categoryIssues.push({
          category: cat.name || cat.id || '',
          url: iss.url,
          priority: iss.priority,
          message: iss.message,
          recommendation: iss.recommendation,
        });
      }
    });
  });
  const securityFindings = (data.security_findings || [])
    .filter((f) => f.url === url)
    .map((f) => ({
      url: f.url,
      severity: f.severity,
      message: f.message,
      recommendation: f.recommendation,
    }));
  return {
    broken,
    redirects,
    seoIssues,
    categoryIssues,
    contentFlags: [],
    securityFindings,
    browserIssues: [],
    recommendations: categoryIssues.map((i) => i.recommendation).filter(Boolean) as string[],
  };
}

export default function UrlInspectorDrawer({ url, onClose }: UrlInspectorDrawerProps) {
  const { data } = useReport();
  const { trail, back, forward, goTo, canGoBack, canGoForward } = useUrlInspector();
  const ui = strings.components.urlInspector;
  // Ensure link-graph data (link_edges, inlink_anchor_matrix) is loaded while the
  // inspector is open, even if it was launched from a view that didn't need it.
  useSectionData('links', Boolean(url));
  const links = (data?.links || []) as ReportLink[];

  const link = useMemo((): LinkDetail | null => {
    if (!url || !data) return null;
    const found = links.find((l) => l.url === url);
    if (found) return found as LinkDetail;
    return { url, status: '', title: '' } as LinkDetail;
  }, [url, data, links]);

  const inspectorDetails = useMemo(() => {
    if (!url || !data) return null;
    return buildInspectorDetails(data, url, links);
  }, [url, data, links]);

  if (!url || !link) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={ui.label}>
      <button type="button" className="flex-1 bg-black/40" onClick={onClose} aria-label={ui.close} />
      <div className="w-full max-w-2xl h-full bg-brand-800 border-l border-default shadow-xl flex flex-col fade-in">
        <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-default">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={back}
              disabled={!canGoBack}
              title={ui.back}
              aria-label={ui.back}
              className="p-1.5 rounded-lg text-muted-foreground enabled:hover:bg-brand-700 enabled:hover:text-bright disabled:opacity-30 disabled:cursor-not-allowed press"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={forward}
              disabled={!canGoForward}
              title={ui.forward}
              aria-label={ui.forward}
              className="p-1.5 rounded-lg text-muted-foreground enabled:hover:bg-brand-700 enabled:hover:text-bright disabled:opacity-30 disabled:cursor-not-allowed press"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <nav aria-label={ui.trailAria} className="flex-1 min-w-0 overflow-x-auto">
            <ol className="flex items-center gap-1 whitespace-nowrap">
              {trail.map((u, i) => {
                const isLast = i === trail.length - 1;
                return (
                  <Fragment key={`${u}-${i}`}>
                    {i > 0 && (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />
                    )}
                    <li className="min-w-0">
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        disabled={isLast}
                        title={u}
                        aria-current={isLast ? 'page' : undefined}
                        className={
                          isLast
                            ? 'font-mono text-xs text-bright truncate max-w-[18rem] block'
                            : 'font-mono text-xs text-muted-foreground hover:text-foreground truncate max-w-[9rem] block transition-colors'
                        }
                      >
                        {shortPath(u) || u}
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          </nav>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-brand-700 shrink-0"
            aria-label={ui.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <InspectorTabs link={link} inspectorDetails={inspectorDetails} />
        </div>
      </div>
    </div>
  );
}
