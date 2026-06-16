import type { InlinkAnchorRow, LinkEdgeRow } from '@/types/report';

/**
 * Adjacency maps for the crawled internal/external link graph.
 *
 * Built ONCE per `link_edges` array (memoize on its identity) so the
 * Connections tab, LinkFlow diagram, and 3D graph can look up a URL's
 * neighbours in O(1) instead of scanning every edge on each render.
 */
export interface Adjacency {
  /** from_url -> edges leaving that page (its outbound links). */
  outByUrl: Map<string, LinkEdgeRow[]>;
  /** to_url -> edges pointing at that page (its inbound links). */
  inByUrl: Map<string, LinkEdgeRow[]>;
}

export function buildAdjacency(linkEdges: readonly LinkEdgeRow[] | null | undefined): Adjacency {
  const outByUrl = new Map<string, LinkEdgeRow[]>();
  const inByUrl = new Map<string, LinkEdgeRow[]>();
  if (!Array.isArray(linkEdges)) return { outByUrl, inByUrl };
  for (const edge of linkEdges) {
    const from = edge?.from_url;
    const to = edge?.to_url;
    if (from) {
      const arr = outByUrl.get(from);
      if (arr) arr.push(edge);
      else outByUrl.set(from, [edge]);
    }
    if (to) {
      const arr = inByUrl.get(to);
      if (arr) arr.push(edge);
      else inByUrl.set(to, [edge]);
    }
  }
  return { outByUrl, inByUrl };
}

/** One neighbour of a page, with the distinct anchor texts used to link it. */
export interface ConnectionAgg {
  /** The other endpoint URL. */
  url: string;
  /** Distinct, non-empty anchor texts across all edges to/from this neighbour. */
  anchors: string[];
  /** Number of edges (links) between the page and this neighbour. */
  count: number;
  /** 'internal' | 'external' (from the first edge seen). */
  linkType: string;
  /** True if any edge to/from this neighbour is rel=nofollow. */
  nofollow: boolean;
}

function aggregate(edges: readonly LinkEdgeRow[], endpoint: 'to_url' | 'from_url'): ConnectionAgg[] {
  const byUrl = new Map<string, ConnectionAgg>();
  for (const e of edges) {
    const other = endpoint === 'to_url' ? e.to_url : e.from_url;
    if (!other) continue;
    let agg = byUrl.get(other);
    if (!agg) {
      agg = { url: other, anchors: [], count: 0, linkType: e.link_type || 'internal', nofollow: false };
      byUrl.set(other, agg);
    }
    agg.count += 1;
    if (e.is_nofollow) agg.nofollow = true;
    const anchor = (e.anchor_text || '').trim();
    if (anchor && !agg.anchors.includes(anchor)) agg.anchors.push(anchor);
  }
  return Array.from(byUrl.values()).sort((a, b) => b.count - a.count);
}

/** Pages this URL links out to (deduped by target). */
export function outboundConnections(url: string, adj: Adjacency): ConnectionAgg[] {
  return aggregate(adj.outByUrl.get(url) || [], 'to_url');
}

/** Pages that link to this URL (deduped by source). */
export function inboundConnections(url: string, adj: Adjacency): ConnectionAgg[] {
  return aggregate(adj.inByUrl.get(url) || [], 'from_url');
}

/** Inlink-anchor-matrix rows targeting a given URL (anchor text + count). */
export function inlinkAnchorsFor(
  url: string,
  matrix: readonly InlinkAnchorRow[] | null | undefined,
): InlinkAnchorRow[] {
  if (!Array.isArray(matrix)) return [];
  return matrix.filter((row) => row?.target_url === url);
}

/** Short, path-only label for a URL (host stripped); falls back to the raw string. */
export function shortPath(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}`;
    return path && path !== '' ? path : '/';
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, '') || url;
  }
}

/** Hostname of a URL, or '' when it cannot be parsed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** HTTP-status → node colour, shared by the link graph, flow diagram and 3D graph. */
export function statusColor(status: string | number | null | undefined): string {
  const s = String(status ?? '');
  if (/^[45]/.test(s)) return '#ef4444'; // red — broken / error
  if (/^3/.test(s)) return '#f59e0b'; // amber — redirect
  if (/^2/.test(s)) return '#3b82f6'; // blue — ok
  return '#64748b'; // slate — unknown
}
