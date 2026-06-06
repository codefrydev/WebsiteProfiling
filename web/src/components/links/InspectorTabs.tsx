'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { Gauge, Share2, Code2, Shield, AlertTriangle, FileBarChart, LineChart } from 'lucide-react';
import ViewTabs from '@/components/ViewTabs';
import type { InspectorDetails, InspectorIssueRow, LinkDetail, LinkLighthouseData } from '@/types/report';
import { strings, format } from '../../lib/strings';
import { SEO_ISSUE_RECOMMENDATIONS } from '../../utils/linkUtils';
import OverviewTab from './tabs/OverviewTab';
import SeoSocialTab from './tabs/SeoSocialTab';
import ContentTab from './tabs/ContentTab';
import TechnicalTab from './tabs/TechnicalTab';
import IssuesTab from './tabs/IssuesTab';
import PageAnalysisTab from './tabs/PageAnalysisTab';
import SearchRetentionTab from './tabs/SearchRetentionTab';

const ci = strings.components.inspectorTabs;

const TAB_ICONS: Record<string, ReactNode> = {
  overview: <Gauge className="h-3.5 w-3.5" />,
  analysis: <FileBarChart className="h-3.5 w-3.5" />,
  search: <LineChart className="h-3.5 w-3.5" />,
  seo: <Share2 className="h-3.5 w-3.5" />,
  content: <Code2 className="h-3.5 w-3.5" />,
  technical: <Shield className="h-3.5 w-3.5" />,
  issues: <AlertTriangle className="h-3.5 w-3.5" />,
};

const TAB_IDS = ['overview', 'analysis', 'search', 'seo', 'content', 'technical', 'issues'] as const;

const TAB_LABELS: Record<string, string> = {
  overview: ci.overview,
  analysis: ci.pageAnalysis,
  search: ci.searchRetention,
  seo: ci.seoSocial,
  content: ci.content,
  technical: ci.technical,
  issues: ci.issues,
};

function buildAllIssues(inspectorDetails: InspectorDetails | null): InspectorIssueRow[] {
  if (!inspectorDetails) return [];
  const list: InspectorIssueRow[] = [];
  inspectorDetails.broken.forEach((i) =>
    list.push({ severity: 'Critical', message: format(ci.brokenMessage, { status: i.status }), type: 'broken' })
  );
  inspectorDetails.redirects.forEach((i) =>
    list.push({ severity: 'High', message: format(ci.redirectMessage, { status: i.status }), type: 'redirect' })
  );
  inspectorDetails.seoIssues.forEach((i) =>
    list.push({ severity: 'High', message: i.message ?? '', type: 'seo', recommendation: i.type ? SEO_ISSUE_RECOMMENDATIONS[i.type as keyof typeof SEO_ISSUE_RECOMMENDATIONS] : undefined })
  );
  inspectorDetails.contentFlags.forEach((i) =>
    list.push({ severity: 'Medium', message: i.label, type: 'content' })
  );
  inspectorDetails.categoryIssues.forEach((i) =>
    list.push({ severity: i.priority || 'Medium', message: i.message ?? '', type: 'category' })
  );
  inspectorDetails.securityFindings.forEach((i) =>
    list.push({ severity: i.severity || 'Medium', message: i.message ?? '', type: 'security' })
  );
  (inspectorDetails.browserIssues || []).forEach((i) =>
    list.push({
      severity: i.severity || 'High',
      message: i.message ?? '',
      type: 'browser',
      detail: i.detail,
      recommendation: i.recommendation,
    })
  );
  return list;
}

export interface InspectorTabsProps {
  link: LinkDetail;
  lhData?: LinkLighthouseData | null;
  inspectorDetails: InspectorDetails | null;
  /** @deprecated Use activeTab + onTabChange for URL-synced tabs */
  initialTab?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const VALID_TABS = new Set(TAB_IDS);

export default function InspectorTabs({
  link,
  lhData,
  inspectorDetails,
  initialTab = 'overview',
  activeTab: controlledTab,
  onTabChange,
}: InspectorTabsProps) {
  const resolvedInitial = VALID_TABS.has(initialTab as typeof TAB_IDS[number]) ? initialTab : 'overview';
  const [internalTab, setInternalTab] = useState(resolvedInitial);
  const isControlled = controlledTab != null && onTabChange != null;
  const activeTab = isControlled ? controlledTab : internalTab;
  const effectiveLh = link?.lighthouse || lhData;

  const issueCount = useMemo(
    () => buildAllIssues(inspectorDetails).length,
    [inspectorDetails]
  );

  useEffect(() => {
    if (isControlled) return;
    if (VALID_TABS.has(initialTab as typeof TAB_IDS[number])) {
      setInternalTab(initialTab);
    }
  }, [link.url, initialTab, isControlled]);

  const handleTabChange = (tab: string) => {
    if (isControlled) onTabChange(tab);
    else setInternalTab(tab);
  };

  const tabs = TAB_IDS.map((id) => ({
    id,
    label: TAB_LABELS[id],
    icon: TAB_ICONS[id],
    badge: id === 'issues' ? issueCount : null,
  }));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-muted bg-brand-800">
        <ViewTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={handleTabChange}
          ariaLabel={ci.overview}
          idPrefix="inspector"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {activeTab === 'overview'  && <OverviewTab  link={link} />}
        {activeTab === 'analysis'  && <PageAnalysisTab link={link} />}
        {activeTab === 'search'    && <SearchRetentionTab link={link} />}
        {activeTab === 'seo'       && <SeoSocialTab link={link} />}
        {activeTab === 'content'   && <ContentTab   link={link} />}
        {activeTab === 'technical' && <TechnicalTab  link={link} />}
        {activeTab === 'issues'    && (
          <IssuesTab lhData={effectiveLh} inspectorDetails={inspectorDetails} />
        )}
      </div>
    </div>
  );
}
