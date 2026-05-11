import { useState, useMemo } from 'react';
import { Gauge, Share2, Code2, Shield, AlertTriangle, FileBarChart } from 'lucide-react';
import { strings, format } from '../../lib/strings';
import { SEO_ISSUE_RECOMMENDATIONS } from '../../utils/linkUtils';
import OverviewTab from './tabs/OverviewTab';
import SeoSocialTab from './tabs/SeoSocialTab';
import ContentTab from './tabs/ContentTab';
import TechnicalTab from './tabs/TechnicalTab';
import IssuesTab from './tabs/IssuesTab';
import PageAnalysisTab from './tabs/PageAnalysisTab';

const ci = strings.components.inspectorTabs;

const TABS = [
  { id: 'overview', label: ci.overview, icon: <Gauge className="h-3.5 w-3.5" /> },
  { id: 'analysis', label: ci.pageAnalysis, icon: <FileBarChart className="h-3.5 w-3.5" /> },
  { id: 'seo', label: ci.seoSocial, icon: <Share2 className="h-3.5 w-3.5" /> },
  { id: 'content', label: ci.content, icon: <Code2 className="h-3.5 w-3.5" /> },
  { id: 'technical', label: ci.technical, icon: <Shield className="h-3.5 w-3.5" /> },
  { id: 'issues', label: ci.issues, icon: <AlertTriangle className="h-3.5 w-3.5" /> },
];

function buildAllIssues(inspectorDetails) {
  if (!inspectorDetails) return [];
  const list = [];
  inspectorDetails.broken.forEach((i) =>
    list.push({ severity: 'Critical', message: format(ci.brokenMessage, { status: i.status }), type: 'broken' })
  );
  inspectorDetails.redirects.forEach((i) =>
    list.push({ severity: 'High', message: format(ci.redirectMessage, { status: i.status }), type: 'redirect' })
  );
  inspectorDetails.seoIssues.forEach((i) =>
    list.push({ severity: 'High', message: i.message, type: 'seo', recommendation: SEO_ISSUE_RECOMMENDATIONS[i.type] })
  );
  inspectorDetails.contentFlags.forEach((i) =>
    list.push({ severity: 'Medium', message: i.label, type: 'content' })
  );
  inspectorDetails.categoryIssues.forEach((i) =>
    list.push({ severity: i.priority || 'Medium', message: i.message, type: 'category' })
  );
  inspectorDetails.securityFindings.forEach((i) =>
    list.push({ severity: i.severity || 'Medium', message: i.message, type: 'security' })
  );
  return list;
}

export default function InspectorTabs({ link, lhData, inspectorDetails }) {
  const [activeTab, setActiveTab] = useState('overview');
  const effectiveLh = link?.lighthouse || lhData;

  const issueCount = useMemo(
    () => buildAllIssues(inspectorDetails).length,
    [inspectorDetails]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-muted bg-brand-800 shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-px ${
              activeTab === t.id
                ? 'text-bright border-blue-500'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:border-brand-700/80'
            }`}
          >
            {t.icon}
            {t.label}
            {t.id === 'issues' && issueCount > 0 && (
              <span className="ml-1 text-xs bg-red-500/20 text-red-800 dark:text-red-300 rounded-full px-1.5 py-0.5 leading-none">
                {issueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview'  && <OverviewTab  link={link} />}
        {activeTab === 'analysis'  && <PageAnalysisTab link={link} />}
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
