
import SortablePaginatedTable from '@/components/google/SortablePaginatedTable';
import { Card } from '@/components';
import { useMemo } from 'react';
import { strings } from '@/lib/strings';
import type { InlinkAnchorRow, LinkRelSummary } from '@/types/report';
import type { TableColumn } from '@/types/components';
import LinkAttributesCharts from './LinkAttributesCharts';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';

const paginationLabels = {
  showingSlice: strings.views.backlinks.table.showingSlice,
  pageOf: strings.views.backlinks.table.pageOf,
  of: strings.views.backlinks.table.of,
  previous: strings.views.backlinks.table.previous,
  next: strings.views.backlinks.table.next,
  rowsPerPage: strings.views.backlinks.table.rowsPerPage,
};

interface LinkAttributesPanelProps {
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

export default function LinkAttributesPanel({ summary, anchors, labels }: LinkAttributesPanelProps) {
  const panelDevData = useMemo(
    () => {
      if (!summary && !(anchors?.length)) return null;
      return {
        widget: 'links.explorer.anchors',
        title: labels.title,
        summary,
        anchorCount: anchors?.length ?? 0,
        anchors: anchors ?? [],
      };
    },
    [anchors, labels.title, summary],
  );

  const summaryDevData = useMemo(
    () =>
      summary
        ? {
            widget: 'links.explorer.anchorSummary',
            ...summary,
          }
        : null,
    [summary],
  );

  if (!summary && !(anchors?.length)) return null;

  const POSITION_COLORS: Record<string, string> = {
    nav:     'bg-blue-500/15 text-blue-400',
    header:  'bg-purple-500/15 text-purple-400',
    content: 'bg-emerald-500/15 text-emerald-400',
    footer:  'bg-slate-500/15 text-slate-400',
    sidebar: 'bg-amber-500/15 text-amber-400',
  };

  const columns: TableColumn[] = [
    { key: 'target_url', label: labels.target },
    { key: 'anchor_text', label: labels.anchor },
    {
      key: 'inlink_count',
      label: labels.inlinks,
      render: (v) => (typeof v === 'number' ? v.toLocaleString() : String(v ?? '')),
    },
    {
      key: 'top_position',
      label: 'Position',
      render: (v) => {
        const pos = String(v ?? '').toLowerCase();
        if (!pos) return null;
        const cls = POSITION_COLORS[pos] ?? 'bg-brand-700/30 text-muted-foreground';
        return (
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
            {pos}
          </span>
        );
      },
    },
  ];

  return (
    <div className="relative group/dev-card space-y-4 min-w-0">
      {panelDevData ? <DevCopyJsonButton data={panelDevData} /> : null}
      <LinkAttributesCharts
        summary={summary}
        anchors={anchors}
        labels={{
          internal: labels.internal,
          external: labels.external,
          nofollow: labels.nofollow,
          sponsored: labels.sponsored,
          follow: labels.follow,
          ugc: labels.ugc,
        }}
      />
      {summary ? (
        <Card devData={summaryDevData ?? undefined} className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          <div><span className="text-muted-foreground">{labels.total}</span><div className="font-semibold">{(summary.total_edges ?? 0).toLocaleString()}</div></div>
          <div><span className="text-muted-foreground">{labels.internal}</span><div className="font-semibold">{(summary.internal_edges ?? 0).toLocaleString()}</div></div>
          <div><span className="text-muted-foreground">{labels.nofollow}</span><div className="font-semibold">{(summary.nofollow_internal ?? 0).toLocaleString()}</div></div>
          <div><span className="text-muted-foreground">{labels.sponsored}</span><div className="font-semibold">{(summary.sponsored_internal ?? 0).toLocaleString()}</div></div>
          <div><span className="text-muted-foreground">{labels.external}</span><div className="font-semibold">{(summary.external_edges ?? 0).toLocaleString()}</div></div>
        </Card>
      ) : null}
      {anchors?.length ? (
        <Card
          devData={{
            widget: 'links.explorer.anchorMatrix',
            title: labels.anchorMatrix,
            count: anchors.length,
            rows: anchors,
          }}
          className="p-4 min-w-0 overflow-hidden"
        >
          <h3 className="text-sm font-semibold mb-3">{labels.anchorMatrix}</h3>
          <SortablePaginatedTable
            rows={anchors as Record<string, unknown>[]}
            columns={columns}
            defaultSort="inlink_count"
            defaultDir="desc"
            paginationLabels={paginationLabels}
          />
        </Card>
      ) : null}
    </div>
  );
}
