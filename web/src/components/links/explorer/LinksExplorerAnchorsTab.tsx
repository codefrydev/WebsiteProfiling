
import LinkAttributesPanel from '@/components/links/LinkAttributesPanel';
import type { InlinkAnchorRow, LinkRelSummary } from '@/types/report';
import { LinksExplorerTabPanel } from './LinksExplorerTabPanel';

export interface LinksExplorerAnchorsTabProps {
  summary?: LinkRelSummary | null;
  anchors?: InlinkAnchorRow[];
  labels: {
    title: string;
    total: string;
    internal: string;
    nofollow: string;
    sponsored: string;
    external: string;
    anchorMatrix: string;
    target: string;
    anchor: string;
    inlinks: string;
    follow: string;
    ugc: string;
  };
}

export function LinksExplorerAnchorsTab({ summary, anchors, labels }: LinksExplorerAnchorsTabProps) {
  return (
    <LinksExplorerTabPanel tabId="anchors" className="flex flex-col gap-4 min-w-0">
      <LinkAttributesPanel summary={summary} anchors={anchors} labels={labels} />
    </LinksExplorerTabPanel>
  );
}
