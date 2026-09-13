
import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2, Search } from 'lucide-react';
import { useReport } from '@/context/useReport';
import { useUrlInspector } from '@/context/UrlInspectorContext';
import { useSectionData } from '@/hooks/useSectionData';
import {
  buildAdjacency,
  inboundConnections,
  inlinkAnchorsFor,
  outboundConnections,
  shortPath,
  statusColor,
  type ConnectionAgg,
} from '@/lib/linkGraph';
import { strings, format } from '@/lib/strings';
import LinkFlow, { type FlowNode } from '../LinkFlow';
import ConnectionInsights, { type AnchorStat } from '../ConnectionInsights';
import type { LinkDetail, PageAnalysis, ReportLink } from '@/types/report';

const FLOW_CAP = 6;
const LIST_CAP = 25;

export interface ConnectionsTabProps {
  link: LinkDetail;
}

function ConnectionRow({
  conn,
  navigable,
  color,
  onDrill,
}: {
  conn: ConnectionAgg;
  navigable: boolean;
  color: string;
  onDrill: (url: string) => void;
}) {
  const ct = strings.components.connectionsTab;
  const label = shortPath(conn.url) || conn.url;
  const anchorPreview =
    conn.anchors.length > 0
      ? format(ct.anchorJoin, { anchor: conn.anchors[0] }) +
        (conn.anchors.length > 1 ? ` ${format(ct.anchorMore, { count: conn.anchors.length - 1 })}` : '')
      : '';

  return (
    <li className="flex items-center gap-2 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-3 py-2 transition-colors hover:border-md-sys-primary/40">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <div className="min-w-0 flex-1">
        {navigable ? (
          <button
            type="button"
            onClick={() => onDrill(conn.url)}
            title={`${ct.drillHint}: ${conn.url}`}
            className="flex w-full items-center gap-1.5 text-left text-md-sys-primary hover:underline"
          >
            <Search className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            <span className="truncate font-mono text-xs">{label}</span>
          </button>
        ) : (
          <span className="block truncate font-mono text-xs text-md-sys-on-surface-variant" title={conn.url}>
            {label}
          </span>
        )}
        {anchorPreview && (
          <span className="mt-0.5 block truncate text-[11px] text-md-sys-on-surface-variant" title={conn.anchors.join(' • ')}>
            {anchorPreview}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {conn.count > 1 && (
          <span className="rounded-full bg-md-sys-surface-container px-2 py-0.5 text-[10px] font-semibold tabular-nums text-md-sys-on-surface-variant">
            ×{conn.count}
          </span>
        )}
        {conn.linkType === 'external' && (
          <span className="rounded-full bg-md-sys-warning-container px-2 py-0.5 text-[10px] font-medium text-md-sys-on-warning-container">
            {ct.externalBadge}
          </span>
        )}
        {conn.nofollow && (
          <span className="rounded-full bg-md-sys-surface-container px-2 py-0.5 text-[10px] text-md-sys-on-surface-variant">
            {ct.nofollowBadge}
          </span>
        )}
        <a
          href={conn.url}
          target="_blank"
          rel="noreferrer"
          title={ct.openLive}
          aria-label={ct.openLive}
          className="press rounded-full p-1 text-md-sys-on-surface-variant hover:bg-md-sys-surface-container hover:text-md-sys-on-surface active:scale-95 transition-all"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </li>
  );
}

function ConnectionList({
  title,
  hint,
  icon,
  emptyText,
  conns,
  urlStatus,
  onDrill,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  emptyText: string;
  conns: ConnectionAgg[];
  urlStatus: Map<string, string>;
  onDrill: (url: string) => void;
}) {
  const ct = strings.components.connectionsTab;
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? conns : conns.slice(0, LIST_CAP);

  return (
    <section className="min-w-0">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-md-sys-on-surface">
        {icon}
        {title}
        <span className="ml-1 font-mono text-xs font-normal text-md-sys-on-surface-variant">{conns.length}</span>
      </h3>
      <p className="mb-2 text-xs text-md-sys-on-surface-variant">{hint}</p>
      {conns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-md-sys-outline-variant/40 px-3 py-4 text-center text-sm text-md-sys-on-surface-variant">
          {emptyText}
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {shown.map((conn, i) => (
              <ConnectionRow
                key={`${conn.url}-${i}`}
                conn={conn}
                navigable={urlStatus.has(conn.url)}
                color={statusColor(urlStatus.get(conn.url))}
                onDrill={onDrill}
              />
            ))}
          </ul>
          {conns.length > LIST_CAP && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs text-md-sys-on-surface-variant hover:text-md-sys-on-surface"
            >
              {showAll ? ct.showLess : format(ct.showAll, { count: conns.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default function ConnectionsTab({ link }: ConnectionsTabProps) {
  const ct = strings.components.connectionsTab;
  const { data } = useReport();
  const { openUrl } = useUrlInspector();
  const status = useSectionData('links');

  const linkEdges = data?.link_edges;
  const adjacency = useMemo(() => buildAdjacency(linkEdges), [linkEdges]);

  const urlStatus = useMemo(() => {
    const map = new Map<string, string>();
    (data?.links as ReportLink[] | undefined)?.forEach((l) => map.set(l.url, String(l.status ?? '')));
    return map;
  }, [data?.links]);

  const inbound = useMemo(() => inboundConnections(link.url, adjacency), [link.url, adjacency]);

  const outbound = useMemo<ConnectionAgg[]>(() => {
    const fromEdges = outboundConnections(link.url, adjacency);
    if (fromEdges.length > 0) return fromEdges;
    // Fallback when edge rows are unavailable: use the page's parsed internal links.
    const pa: PageAnalysis = link.page_analysis && typeof link.page_analysis === 'object' ? link.page_analysis : {};
    const internal = Array.isArray(pa.internal_links) ? pa.internal_links : [];
    return internal.map((u) => ({ url: u, anchors: [], count: 1, linkType: 'internal', nofollow: false }));
  }, [adjacency, link.url, link.page_analysis]);

  const topAnchors = useMemo<AnchorStat[]>(() => {
    const rows = inlinkAnchorsFor(link.url, data?.inlink_anchor_matrix);
    const byAnchor = new Map<string, number>();
    rows.forEach((r) => {
      const anchor = (r.anchor_text || '').trim();
      byAnchor.set(anchor, (byAnchor.get(anchor) || 0) + (Number(r.inlink_count) || 0));
    });
    return Array.from(byAnchor.entries())
      .map(([anchor, count]) => ({ anchor, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [link.url, data?.inlink_anchor_matrix]);

  const toFlowNodes = (conns: ConnectionAgg[]): FlowNode[] =>
    conns.slice(0, FLOW_CAP).map((c) => ({
      url: c.url,
      color: statusColor(urlStatus.get(c.url)),
      clickable: urlStatus.has(c.url),
    }));

  const loading = status === 'loading' && inbound.length === 0 && outbound.length === 0;
  const noData =
    status === 'loaded' &&
    !Array.isArray(linkEdges) &&
    inbound.length === 0 &&
    outbound.length === 0;

  return (
    <div className="flex flex-col gap-5 min-h-0">
      <p className="shrink-0 text-sm leading-relaxed text-md-sys-on-surface-variant">{ct.intro}</p>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-md-sys-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> {ct.loading}
        </p>
      ) : noData ? (
        <p className="py-10 text-center text-sm text-md-sys-on-surface-variant">{ct.noData}</p>
      ) : (
        <>
          <LinkFlow
            current={link.url}
            currentColor={statusColor(urlStatus.get(link.url) ?? link.status)}
            inbound={toFlowNodes(inbound)}
            outbound={toFlowNodes(outbound)}
            inboundTotal={inbound.length}
            outboundTotal={outbound.length}
            onSelect={openUrl}
          />

          <ConnectionInsights
            inboundCount={inbound.length}
            outboundCount={outbound.length}
            topAnchors={topAnchors}
          />

          <div className="grid grid-cols-2 gap-4">
            <ConnectionList
              title={ct.inboundTitle}
              hint={ct.inboundHint}
              icon={<ArrowDownLeft className="h-4 w-4 text-md-sys-success" />}
              emptyText={ct.inboundEmpty}
              conns={inbound}
              urlStatus={urlStatus}
              onDrill={openUrl}
            />
            <ConnectionList
              title={ct.outboundTitle}
              hint={ct.outboundHint}
              icon={<ArrowUpRight className="h-4 w-4 text-md-sys-primary" />}
              emptyText={ct.outboundEmpty}
              conns={outbound}
              urlStatus={urlStatus}
              onDrill={openUrl}
            />
          </div>
        </>
      )}
    </div>
  );
}
