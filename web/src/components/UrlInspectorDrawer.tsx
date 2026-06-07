'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useReport } from '@/context/useReport';
import InspectorTabs from '@/components/links/InspectorTabs';
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
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="URL inspector">
      <button type="button" className="flex-1 bg-black/40" onClick={onClose} aria-label="Close inspector" />
      <div className="w-full max-w-2xl h-full bg-background border-l border-default shadow-xl flex flex-col">
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-default">
          <p className="text-sm font-mono truncate text-foreground">{url}</p>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-brand-700" aria-label="Close">
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
