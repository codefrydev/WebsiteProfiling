/**
 * Build URL path prefix tree aggregates from crawl `links` for Site structure view.
 */
import type {
  PathRollup,
  PathRollupMetrics,
  PathTreeNode,
  PathTreeTableRow,
  ReportLink,
} from '@/types/report';

function emptyRollup(): PathRollup {
  return {
    pages: 0,
    inlinks: 0,
    outlinks: 0,
    wcSum: 0,
    wcN: 0,
    rtSum: 0,
    rtN: 0,
    lhPerfSum: 0,
    lhPerfN: 0,
    lhSeoSum: 0,
    lhSeoN: 0,
  };
}

function addRollup(a: PathRollup, b: PathRollup): void {
  a.pages += b.pages;
  a.inlinks += b.inlinks;
  a.outlinks += b.outlinks;
  a.wcSum += b.wcSum;
  a.wcN += b.wcN;
  a.rtSum += b.rtSum;
  a.rtN += b.rtN;
  a.lhPerfSum += b.lhPerfSum;
  a.lhPerfN += b.lhPerfN;
  a.lhSeoSum += b.lhSeoSum;
  a.lhSeoN += b.lhSeoN;
}

export function finalizeRollup(r: PathRollup): PathRollupMetrics {
  return {
    pages: r.pages,
    inlinks: r.inlinks,
    outlinks: r.outlinks,
    avgWordCount: r.wcN > 0 ? r.wcSum / r.wcN : null,
    avgResponseMs: r.rtN > 0 ? r.rtSum / r.rtN : null,
    avgPerfScore: r.lhPerfN > 0 ? r.lhPerfSum / r.lhPerfN : null,
    avgSeoScore: r.lhSeoN > 0 ? r.lhSeoSum / r.lhSeoN : null,
  };
}

/** Pathname for tree keys: leading slash; trailing slash preserved when present in the URL. */
export function normalizePathname(url: string, expectedHost = ''): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    try {
      u = new URL(trimmed, 'https://placeholder.local/');
    } catch {
      return null;
    }
  }
  const host = u.hostname.toLowerCase();
  if (expectedHost && host && host !== expectedHost.toLowerCase()) return null;
  const p = u.pathname || '/';
  return p || '/';
}

/** True when link URL belongs under a path-tree prefix key. */
export function linkMatchesPathKey(url: string, pathKey: string, expectedHost = ''): boolean {
  const pathname = normalizePathname(url, expectedHost);
  if (!pathname) return false;
  if (!pathKey || pathKey === '/') return true;
  return pathname === pathKey || pathname.startsWith(`${pathKey}/`);
}

/** Prefix paths from pathname: `/`, `/blog`, `/blog/a/` for `/blog/a/`. */
export function prefixKeysForPathname(pathname: string): string[] {
  if (!pathname || pathname === '/') return ['/'];
  const trailing = pathname.endsWith('/') && pathname.length > 1;
  const core = trailing ? pathname.slice(0, -1) : pathname;
  const parts = core.split('/').filter(Boolean);
  const keys = ['/'];
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const isLast = i === parts.length - 1;
    keys.push(isLast && trailing ? `${acc}/` : acc);
  }
  return keys;
}

function segmentCount(pathKey: string): number {
  if (!pathKey || pathKey === '/') return 0;
  return pathKey.split('/').filter(Boolean).length;
}

export function parentPathKey(pathKey: string): string | null {
  if (!pathKey || pathKey === '/') return null;
  const parts = pathKey.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  parts.pop();
  return `/${parts.join('/')}`;
}

export function segmentLabel(pathKey: string): string {
  if (!pathKey || pathKey === '/') return '/';
  const parts = pathKey.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '/';
}

function rollupFromLink(link: ReportLink): PathRollup {
  const r = emptyRollup();
  r.pages = 1;
  r.inlinks = Number(link?.inlinks ?? 0) || 0;
  r.outlinks = Number(link?.outlinks ?? 0) || 0;
  const wc = link?.word_count;
  if (wc != null && Number.isFinite(Number(wc))) {
    r.wcSum = Number(wc);
    r.wcN = 1;
  }
  const rt = link?.response_time_ms;
  if (rt != null && Number.isFinite(Number(rt))) {
    r.rtSum = Number(rt);
    r.rtN = 1;
  }
  const mm = link?.lighthouse?.median_metrics;
  if (mm && typeof mm === 'object') {
    const perf = mm.performance_score;
    const seo = mm.seo_score;
    if (perf != null && Number.isFinite(Number(perf))) {
      r.lhPerfSum = Number(perf);
      r.lhPerfN = 1;
    }
    if (seo != null && Number.isFinite(Number(seo))) {
      r.lhSeoSum = Number(seo);
      r.lhSeoN = 1;
    }
  }
  return r;
}

export interface PathMetricsPair {
  current: PathRollupMetrics;
  baseline: PathRollupMetrics | null;
}

export function aggregateLinksByPath(
  links: ReportLink[],
  expectedHost = '',
): Map<string, PathRollup> {
  const map = new Map<string, PathRollup>();
  const list = Array.isArray(links) ? links : [];
  for (const link of list) {
    const pathname = normalizePathname(String(link?.url || ''), expectedHost);
    if (pathname == null) continue;
    const keys = prefixKeysForPathname(pathname);
    const row = rollupFromLink(link);
    for (const key of keys) {
      if (!map.has(key)) map.set(key, emptyRollup());
      addRollup(map.get(key)!, row);
    }
  }
  return map;
}

export function mergeWithBaseline(
  current: Map<string, PathRollup>,
  baseline: Map<string, PathRollup>,
): Map<string, PathMetricsPair> {
  const out = new Map<string, PathMetricsPair>();
  for (const [key, roll] of current) {
    out.set(key, {
      current: finalizeRollup(roll),
      baseline: baseline.has(key) ? finalizeRollup(baseline.get(key)!) : null,
    });
  }
  for (const [key, roll] of baseline) {
    if (out.has(key)) continue;
    out.set(key, {
      current: {
        pages: 0,
        inlinks: 0,
        outlinks: 0,
        avgWordCount: null,
        avgResponseMs: null,
        avgPerfScore: null,
        avgSeoScore: null,
      },
      baseline: finalizeRollup(roll),
    });
  }
  return out;
}

export function buildPathTree(merged: Map<string, PathMetricsPair>): PathTreeNode | null {
  if (!merged.size) return null;
  const keys = [...merged.keys()].sort((a, b) => a.localeCompare(b));
  const nodeByKey = new Map<string, PathTreeNode>();

  for (const key of keys) {
    const metrics = merged.get(key)!;
    nodeByKey.set(key, {
      pathKey: key,
      segment: segmentLabel(key),
      children: [],
      current: metrics.current,
      baseline: metrics.baseline,
    });
  }

  const rootNode = nodeByKey.get('/');
  for (const key of keys) {
    if (key === '/') continue;
    const parent = parentPathKey(key);
    const child = nodeByKey.get(key)!;
    if (parent && nodeByKey.has(parent)) {
      nodeByKey.get(parent)!.children.push(child);
    } else if (rootNode) {
      rootNode.children.push(child);
    }
  }

  for (const n of nodeByKey.values()) {
    n.children.sort((a, b) => {
      const pc = b.current.pages - a.current.pages;
      if (pc !== 0) return pc;
      return a.segment.localeCompare(b.segment);
    });
  }

  return nodeByKey.get('/') || null;
}

export function defaultExpandedPathKeys(
  allPathKeys: Iterable<string>,
  maxSegmentDepth = 2,
): Set<string> {
  const s = new Set<string>(['/']);
  for (const key of allPathKeys) {
    if (segmentCount(key) <= maxSegmentDepth) s.add(key);
  }
  return s;
}

export function flattenTreeForTable(
  node: PathTreeNode,
  expanded: Set<string>,
  depth: number,
  out: PathTreeTableRow[],
): void {
  if (!node) return;
  out.push({ ...node, depth });
  if (!node.children.length) return;
  if (!expanded.has(node.pathKey)) return;
  for (const ch of node.children) {
    flattenTreeForTable(ch, expanded, depth + 1, out);
  }
}

export function filterLinksBySearch(links: ReportLink[], query: string): ReportLink[] {
  const q = (query || '').toLowerCase().trim();
  if (!q) return Array.isArray(links) ? [...links] : [];
  const list = Array.isArray(links) ? links : [];
  return list.filter((l) => {
    const url = String(l?.url || '').toLowerCase();
    const title = String(l?.title || '').toLowerCase();
    return url.includes(q) || title.includes(q);
  });
}
