import SummaryCard from '@/components/google/SummaryCard';
import type { GscLinksReportData } from '@/types/report';
import { summaryCounts } from './backlinksTableUtils';

interface GscLinksSummaryCardsProps {
  data: GscLinksReportData;
  labels: {
    referringDomains: string;
    linkedPages: string;
    sampleLinks: string;
    latestLinks: string;
  };
}

export default function GscLinksSummaryCards({ data, labels }: GscLinksSummaryCardsProps) {
  const counts = summaryCounts(data);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <SummaryCard label={labels.referringDomains} value={counts.referringDomains.toLocaleString()} />
      <SummaryCard label={labels.linkedPages} value={counts.linkedPages.toLocaleString()} />
      <SummaryCard label={labels.sampleLinks} value={counts.sampleLinks.toLocaleString()} />
      <SummaryCard label={labels.latestLinks} value={counts.latestLinks.toLocaleString()} />
    </div>
  );
}
