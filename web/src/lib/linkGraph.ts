import type { GraphEdge, GraphNode, InlinkAnchorRow, LinkEdgeRow, ReportLink } from '@/types/report';

export interface LinkGraphNode {
  id: string;
  label: string;
  title: string;
  color: string;
}

export interface LinkGraphLink {
  source: string;
  target: string;
}

/** Normalize link endpoint after force-graph libs mutate source/target into node objects. */
export function linkEndpointId(endpoint: string | { id?: string } | null | undefined): string {
  if (endpoint == null) return '';
  return typeof endpoint === 'object' ? String(endpoint.id ?? '') : String(endpoint);
}

/** Shallow clone so 2D/3D renderers cannot mutate shared payload state. */
export function cloneLinkGraphPayload(payload: LinkGraphPayload): LinkGraphPayload {
  return {
    ...payload,
    nodes: payload.nodes.map((n) => ({ ...n })),
    links: payload.links.map((l) => ({
      source: linkEndpointId(l.source),
      target: linkEndpointId(l.target),
    })),
  };
}

export interface LinkGraphPayload {
  nodes: LinkGraphNode[];
  links: LinkGraphLink[];
  searchActive: boolean;
  totalNodeCount: number;
}

function graphNodeId(u: GraphNode): string {
  return typeof u === 'string' ? u : (u.id || u.url || String(u));
}

function pathLabel(id: string): string {
  const stripped = shortPath(id);
  if (stripped) return stripped;
  return id.replace(/^https?:\/\/[^/]+/, '') || '/';
}

/** Build force-graph nodes/links from report graph_nodes, graph_edges, and link status rows. */
export function buildLinkGraphPayload(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  linkRows: readonly ReportLink[],
  searchQuery?: string,
): LinkGraphPayload | null {
  if (graphNodes.length === 0 && graphEdges.length === 0) return null;

  const urlToStatus: Record<string, string> = {};
  for (const row of linkRows) {
    if (row?.url) urlToStatus[row.url] = String(row.status ?? '');
  }

  const nodeMap = new Map<string, LinkGraphNode>();
  for (const u of graphNodes) {
    const id = graphNodeId(u);
    nodeMap.set(id, {
      id,
      label: pathLabel(id),
      title: id,
      color: statusColor(urlToStatus[id]),
    });
  }

  for (const e of graphEdges) {
    const fromId = e.from ?? e['from'];
    const toId = e.to ?? e['to'];
    for (const rawId of [fromId, toId]) {
      if (!rawId) continue;
      const id = String(rawId);
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          label: pathLabel(id),
          title: id,
          color: statusColor(urlToStatus[id]),
        });
      }
    }
  }

  const q = (searchQuery || '').toLowerCase().trim();
  let ids = Array.from(nodeMap.keys());
  if (q) ids = ids.filter((id) => id.toLowerCase().includes(q));

  const idSet = new Set(ids);
  const nodes = ids.map((id) => nodeMap.get(id)).filter((n): n is LinkGraphNode => n != null);
  const links = graphEdges
    .map((e) => {
      const fromId = e.from ?? e['from'];
      const toId = e.to ?? e['to'];
      if (!fromId || !toId) return null;
      const source = String(fromId);
      const target = String(toId);
      return idSet.has(source) && idSet.has(target) ? { source, target } : null;
    })
    .filter((link): link is LinkGraphLink => link != null);

  return {
    nodes,
    links,
    searchActive: !!q,
    totalNodeCount: nodeMap.size,
  };
}

function isHomepageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '';
  } catch {
    return false;
  }
}

/** Pick the crawl root (homepage preferred, else shallowest depth). */
export function findTreeRoot(
  nodeIds: readonly string[],
  urlToDepth: ReadonlyMap<string, number>,
): string {
  if (nodeIds.length === 0) return '';

  let candidates = nodeIds.filter((id) => (urlToDepth.get(id) ?? 0) === 0);
  if (candidates.length === 0) {
    const minDepth = Math.min(...nodeIds.map((id) => urlToDepth.get(id) ?? 999));
    candidates = nodeIds.filter((id) => (urlToDepth.get(id) ?? 999) === minDepth);
  }

  const homepage = candidates.find(isHomepageUrl);
  if (homepage) return homepage;

  candidates.sort((a, b) => a.length - b.length);
  return candidates[0] ?? nodeIds[0];
}

/** One parent link per page — crawl discovery tree, not the full link mesh. */
export function buildTreeLinks(
  nodeIds: Set<string>,
  graphEdges: GraphEdge[],
  urlToDepth: ReadonlyMap<string, number>,
  rootId: string,
): LinkGraphLink[] {
  const inbound = new Map<string, string[]>();
  for (const e of graphEdges) {
    const from = String(e.from ?? e['from'] ?? '');
    const to = String(e.to ?? e['to'] ?? '');
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to) || from === to) continue;
    if (!inbound.has(to)) inbound.set(to, []);
    inbound.get(to)!.push(from);
  }

  const parentOf = new Map<string, string>();
  const sorted = [...nodeIds].sort(
    (a, b) =>
      (urlToDepth.get(a) ?? 999) - (urlToDepth.get(b) ?? 999) || a.localeCompare(b),
  );

  for (const id of sorted) {
    if (id === rootId) continue;

    const depth = urlToDepth.get(id) ?? 999;
    const inbounds = inbound.get(id) || [];
    const shallower = inbounds
      .filter((p) => nodeIds.has(p) && (urlToDepth.get(p) ?? 999) < depth)
      .sort((a, b) => (urlToDepth.get(a) ?? 999) - (urlToDepth.get(b) ?? 999));

    let parent = shallower[0];
    if (!parent) {
      parent = inbounds
        .filter((p) => nodeIds.has(p))
        .sort((a, b) => (urlToDepth.get(a) ?? 999) - (urlToDepth.get(b) ?? 999))[0];
    }
    if (!parent && nodeIds.has(rootId)) parent = rootId;
    if (parent && parent !== id) parentOf.set(id, parent);
  }

  return [...parentOf.entries()].map(([target, source]) => ({ source, target }));
}

/**
 * Crawl discovery tree for the network map — one spine link per page instead of
 * the full internal link mesh (unreadable on dense sites).
 */
export function buildLinkTreePayload(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  linkRows: readonly ReportLink[],
  searchQuery?: string,
): LinkGraphPayload | null {
  const base = buildLinkGraphPayload(graphNodes, graphEdges, linkRows, searchQuery);
  if (!base || base.nodes.length === 0) return base;

  const urlToDepth = new Map<string, number>();
  for (const row of linkRows) {
    if (row?.url != null && row.depth != null) urlToDepth.set(row.url, row.depth);
  }

  const nodeIds = new Set(base.nodes.map((n) => n.id));
  const rootId = findTreeRoot([...nodeIds], urlToDepth);
  if (!rootId) return base;

  return {
    ...base,
    links: buildTreeLinks(nodeIds, graphEdges, urlToDepth, rootId),
  };
}

/** Parent + children only (tree neighbours). */
export function buildTreeNeighborIndex(
  links: readonly (LinkGraphLink | { source: string | { id?: string }; target: string | { id?: string } })[],
): Map<string, Set<string>> {
  const parent = new Map<string, string>();
  const children = new Map<string, Set<string>>();

  for (const l of links) {
    const source = linkEndpointId(l.source);
    const target = linkEndpointId(l.target);
    if (!source || !target) continue;
    parent.set(target, source);
    if (!children.has(source)) children.set(source, new Set());
    children.get(source)!.add(target);
  }

  const ids = new Set<string>([...parent.keys(), ...parent.values(), ...children.keys()]);
  const m = new Map<string, Set<string>>();
  for (const id of ids) {
    const neighbors = new Set<string>();
    const p = parent.get(id);
    if (p) neighbors.add(p);
    for (const c of children.get(id) || []) neighbors.add(c);
    m.set(id, neighbors);
  }
  return m;
}

/** Undirected neighbour lookup for click-to-highlight. */
export function buildNeighborIndex(
  links: readonly (LinkGraphLink | { source: string | { id?: string }; target: string | { id?: string } })[],
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const l of links) {
    const source = linkEndpointId(l.source);
    const target = linkEndpointId(l.target);
    if (!source || !target) continue;
    if (!m.has(source)) m.set(source, new Set());
    if (!m.has(target)) m.set(target, new Set());
    m.get(source)!.add(target);
    m.get(target)!.add(source);
  }
  return m;
}

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
