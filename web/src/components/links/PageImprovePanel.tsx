
import { useCallback, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import { useOptionalReport } from '@/context/useReport';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import type { InspectorDetails } from '@/types/report';
import { Button } from '@/components';

const FIX_TEMPLATES: Record<string, string> = {
  title: 'Add a unique, descriptive title tag (50–60 characters) with primary keyword near the start.',
  meta: 'Write a compelling meta description (120–160 characters) that matches search intent.',
  canonical: 'Set rel=canonical to the preferred URL version of this page.',
  h1: 'Use exactly one H1 that describes the main topic; align it with the title where appropriate.',
  noindex: 'Remove noindex if this page should rank; keep it only for thin or duplicate URLs.',
  broken: 'Fix or remove links to broken URLs; update redirects at the source.',
  accessibility: 'Address axe/Lighthouse accessibility findings on this URL.',
};

interface PageCoachResult {
  summary?: string;
  actions?: string[];
  provenance?: string;
}

interface PageImprovePanelProps {
  url: string;
  inspectorDetails: InspectorDetails | null;
}

export default function PageImprovePanel({ url, inspectorDetails }: PageImprovePanelProps) {
  const pi = strings.components.pageImprove;
  const reportCtx = useOptionalReport();
  const { readOnly } = useReadOnlySession();
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coach, setCoach] = useState<PageCoachResult | null>(null);

  const items = inspectorDetails?.categoryIssues || [];
  const checklist = items.length
    ? items.map((iss) => ({
        message: iss.message || 'Issue',
        recommendation: iss.recommendation || FIX_TEMPLATES.accessibility,
        priority: iss.priority || 'Medium',
      }))
    : [
        { message: 'No open category issues for this URL.', recommendation: FIX_TEMPLATES.title, priority: 'Low' },
      ];

  const fetchCoach = useCallback(async () => {
    if (readOnly) return;
    setCoachLoading(true);
    setCoachError(null);
    try {
      const body: Record<string, unknown> = { url };
      const reportId = reportCtx?.selectedReportId;
      if (reportId != null) {
        body.currentType = 'snapshot';
        body.currentId = reportId;
      }
      const res = await apiFetch(apiUrl('/links/page-coach'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || pi.coachFailed);
      }
      setCoach((payload.coach || null) as PageCoachResult | null);
    } catch (e) {
      setCoachError(e instanceof Error ? e.message : pi.coachFailed);
    } finally {
      setCoachLoading(false);
    }
  }, [readOnly, url, reportCtx?.selectedReportId, pi.coachFailed]);

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        Page Improve checklist for <span className="font-mono text-foreground break-all">{url}</span>
      </p>
      {!readOnly ? (
        <Button type="button" variant="secondary" className="!text-xs" onClick={() => void fetchCoach()} disabled={coachLoading}>
          {coachLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {coachLoading ? pi.coachLoading : pi.coachButton}
        </Button>
      ) : null}
      {coachError ? <p className="text-xs text-red-700 dark:text-red-400">{coachError}</p> : null}
      {coach?.summary ? (
        <div className="rounded-lg border border-default bg-brand-900/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">{pi.coachTitle}</p>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans leading-relaxed">{coach.summary}</pre>
          {coach.actions?.length ? (
            <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
              {coach.actions.slice(0, 8).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <ol className="space-y-3 list-decimal list-inside">
        {checklist.slice(0, 12).map((item, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium text-foreground">{item.message}</span>
            <span className="ml-2 text-xs rounded px-1.5 py-0.5 bg-brand-800 text-muted-foreground">{item.priority}</span>
            <p className="text-xs text-muted-foreground mt-1 ml-5">{item.recommendation}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
