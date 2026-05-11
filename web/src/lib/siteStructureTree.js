/**
 * Build URL path prefix tree aggregates from crawl `links` for Site structure view.
 */

/** @typedef {object} PathRollup
 * @property {number} pages
 * @property {number} inlinks
 * @property {number} outlinks
 * @property {number} wcSum
 * @property {number} wcN
 * @property {number} rtSum
 * @property {number} rtN
 * @property {number} lhPerfSum
 * @property {number} lhPerfN
 * @property {number} lhSeoSum
 * @property {number} lhSeoN
 */

/** @returns {PathRollup} */
function emptyRollup() {
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

/**
 * @param {PathRollup} a
 * @param {PathRollup} b
 */
function addRollup(a, b) {
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

/**
 * @param {PathRollup} r
 * @returns {object}
 */
export function finalizeRollup(r) {
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

/**
 * Pathname for tree keys: leading slash, no trailing slash except root `/`.
 * @param {string} url
 * @param {string} [expectedHost] - lowercase hostname; if set, skip other hosts
 * @returns {string | null}
 */
export function normalizePathname(url, expectedHost = '') {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let u;
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
  let p = u.pathname || '/';
  if (p !== '/' && p.endsWith('/')) {
    p = p.replace(/\/+$/, '') || '/';
  }
  return p || '/';
}

/**
 * Prefix paths from pathname: `/`, `/blog`, `/blog/a` for `/blog/a`.
 * @param {string} pathname
 * @returns {string[]}
 */
export function prefixKeysForPathname(pathname) {
  if (!pathname || pathname === '/') return ['/'];
  const parts = pathname.split('/').filter(Boolean);
  const keys = ['/'];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    keys.push(acc);
  }
  return keys;
}

function segmentCount(pathKey) {
  if (!pathKey || pathKey === '/') return 0;
  return pathKey.split('/').filter(Boolean).length;
}

/**
 * @param {string} pathKey
 * @returns {string | null} parent path key
 */
export function parentPathKey(pathKey) {
  if (!pathKey || pathKey === '/') return null;
  const parts = pathKey.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  parts.pop();
  return `/${parts.join('/')}`;
}

/**
 * Last segment label for display.
 * @param {string} pathKey
 */
export function segmentLabel(pathKey) {
  if (!pathKey || pathKey === '/') return '/';
  const parts = pathKey.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '/';
}

/**
 * @param {object} link
 * @returns {PathRollup}
 */
function rollupFromLink(link) {
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

/**
 * @param {Array<object>} links
 * @param {string} [expectedHost]
 * @returns {Map<string, PathRollup>}
 */
export function aggregateLinksByPath(links, expectedHost = '') {
  const map = new Map();
  const list = Array.isArray(links) ? links : [];
  for (const link of list) {
    const pathname = normalizePathname(String(link?.url || ''), expectedHost);
    if (pathname == null) continue;
    const keys = prefixKeysForPathname(pathname);
    const row = rollupFromLink(link);
    for (const key of keys) {
      if (!map.has(key)) map.set(key, emptyRollup());
      addRollup(map.get(key), row);
    }
  }
  return map;
}

/**
 * @param {Map<string, PathRollup>} current
 * @param {Map<string, PathRollup>} baseline
 * @returns {Map<string, { current: ReturnType<finalizeRollup>, baseline: ReturnType<finalizeRollup> | null }>}
 */
export function mergeWithBaseline(current, baseline) {
  const out = new Map();
  for (const [key, roll] of current) {
    out.set(key, {
      current: finalizeRollup(roll),
      baseline: baseline.has(key) ? finalizeRollup(baseline.get(key)) : null,
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

/**
 * @typedef {object} PathTreeNode
 * @property {string} pathKey
 * @property {string} segment
 * @property {PathTreeNode[]} children
 * @property {object} current
 * @property {object | null} baseline
 */

/**
 * @param {Map<string, { current: object, baseline: object | null }>} merged
 * @returns {PathTreeNode | null}
 */
export function buildPathTree(merged) {
  if (!merged.size) return null;
  const keys = [...merged.keys()].sort((a, b) => a.localeCompare(b));
  const nodeByKey = new Map();

  for (const key of keys) {
    const metrics = merged.get(key);
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
    const child = nodeByKey.get(key);
    if (parent && nodeByKey.has(parent)) {
      nodeByKey.get(parent).children.push(child);
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

/**
 * @param {Set<string>} expanded
 * @param {number} maxSegmentDepth - paths with segment count <= this start expanded
 */
export function defaultExpandedPathKeys(allPathKeys, maxSegmentDepth = 2) {
  const s = new Set(['/']);
  for (const key of allPathKeys) {
    if (segmentCount(key) <= maxSegmentDepth) s.add(key);
  }
  return s;
}

/**
 * @param {PathTreeNode} node
 * @param {Set<string>} expanded
 * @param {number} depth
 * @param {Array<PathTreeNode & { depth: number }>} out
 */
export function flattenTreeForTable(node, expanded, depth, out) {
  if (!node) return;
  out.push({ ...node, depth });
  if (!node.children.length) return;
  if (!expanded.has(node.pathKey)) return;
  for (const ch of node.children) {
    flattenTreeForTable(ch, expanded, depth + 1, out);
  }
}

/**
 * @param {Array<object>} links
 * @param {string} query
 * @returns {Array<object>}
 */
export function filterLinksBySearch(links, query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return Array.isArray(links) ? [...links] : [];
  const list = Array.isArray(links) ? links : [];
  return list.filter((l) => {
    const url = String(l?.url || '').toLowerCase();
    const title = String(l?.title || '').toLowerCase();
    return url.includes(q) || title.includes(q);
  });
}
