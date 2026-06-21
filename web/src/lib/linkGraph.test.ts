import { describe, it, expect } from 'vitest';
import {
  buildLinkGraphPayload,
  buildLinkTreePayload,
  buildNeighborIndex,
  buildTreeNeighborIndex,
  cloneLinkGraphPayload,
  findTreeRoot,
  linkEndpointId,
  statusColor,
} from './linkGraph';
import type { GraphEdge, GraphNode, ReportLink } from '@/types/report';

const BASE = 'https://example.com';

describe('buildLinkGraphPayload', () => {
  it('returns null when nodes and edges are empty', () => {
    expect(buildLinkGraphPayload([], [], [])).toBeNull();
  });

  it('builds nodes from graph_nodes with status colors', () => {
    const nodes: GraphNode[] = [`${BASE}/`, `${BASE}/broken`];
    const links: ReportLink[] = [
      { url: `${BASE}/`, status: '200' },
      { url: `${BASE}/broken`, status: '404' },
    ];
    const payload = buildLinkGraphPayload(nodes, [], links);
    expect(payload).not.toBeNull();
    expect(payload!.nodes).toHaveLength(2);
    expect(payload!.nodes[0]?.color).toBe(statusColor('200'));
    expect(payload!.nodes[1]?.color).toBe(statusColor('404'));
    expect(payload!.nodes[0]?.label).toBe('/');
  });

  it('adds edge-only endpoints not listed in graph_nodes', () => {
    const edges: GraphEdge[] = [{ from: `${BASE}/a`, to: `${BASE}/b` }];
    const payload = buildLinkGraphPayload([], edges, []);
    expect(payload!.nodes).toHaveLength(2);
    expect(payload!.links).toEqual([
      { source: `${BASE}/a`, target: `${BASE}/b` },
    ]);
  });

  it('filters nodes by search query', () => {
    const nodes: GraphNode[] = [`${BASE}/blog`, `${BASE}/about`];
    const payload = buildLinkGraphPayload(nodes, [], [], 'blog');
    expect(payload!.searchActive).toBe(true);
    expect(payload!.nodes).toHaveLength(1);
    expect(payload!.nodes[0]?.id).toBe(`${BASE}/blog`);
    expect(payload!.totalNodeCount).toBe(2);
  });

  it('drops links when an endpoint is filtered out by search', () => {
    const nodes: GraphNode[] = [`${BASE}/blog`, `${BASE}/about`];
    const edges: GraphEdge[] = [{ from: `${BASE}/blog`, to: `${BASE}/about` }];
    const payload = buildLinkGraphPayload(nodes, edges, [], 'blog');
    expect(payload!.nodes).toHaveLength(1);
    expect(payload!.links).toHaveLength(0);
  });
});

describe('buildNeighborIndex', () => {
  it('builds undirected adjacency', () => {
    const idx = buildNeighborIndex([
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]);
    expect(idx.get('a')).toEqual(new Set(['b']));
    expect(idx.get('b')).toEqual(new Set(['a', 'c']));
    expect(idx.get('c')).toEqual(new Set(['b']));
  });

  it('normalizes object endpoints from force-graph mutation', () => {
    const idx = buildNeighborIndex([
      { source: { id: 'a' }, target: { id: 'b' } },
    ]);
    expect(idx.get('a')).toEqual(new Set(['b']));
  });
});

describe('cloneLinkGraphPayload', () => {
  it('copies nodes and stringifies link endpoints', () => {
    const payload = {
      nodes: [{ id: 'a', label: '/a', title: 'a', color: '#000' }],
      links: [{ source: { id: 'a' } as unknown as string, target: { id: 'b' } as unknown as string }],
      searchActive: false,
      totalNodeCount: 2,
    };
    const cloned = cloneLinkGraphPayload(payload);
    expect(cloned.nodes).not.toBe(payload.nodes);
    expect(cloned.links).toEqual([{ source: 'a', target: 'b' }]);
  });
});

describe('linkEndpointId', () => {
  it('returns string ids unchanged', () => {
    expect(linkEndpointId('https://ex.com/page')).toBe('https://ex.com/page');
  });

  it('extracts id from node objects', () => {
    expect(linkEndpointId({ id: 'https://ex.com/page' })).toBe('https://ex.com/page');
  });
});

describe('buildLinkTreePayload', () => {
  it('produces one tree link per child instead of the full mesh', () => {
    const nodes: GraphNode[] = [`${BASE}/`, `${BASE}/a`, `${BASE}/b`];
    const edges: GraphEdge[] = [
      { from: `${BASE}/`, to: `${BASE}/a` },
      { from: `${BASE}/`, to: `${BASE}/b` },
      { from: `${BASE}/a`, to: `${BASE}/b` },
    ];
    const linkRows: ReportLink[] = [
      { url: `${BASE}/`, status: '200', depth: 0 },
      { url: `${BASE}/a`, status: '200', depth: 1 },
      { url: `${BASE}/b`, status: '200', depth: 1 },
    ];
    const payload = buildLinkTreePayload(nodes, edges, linkRows);
    expect(payload!.links).toHaveLength(2);
    expect(payload!.links.every((l) => l.source === `${BASE}/`)).toBe(true);
  });

  it('prefers homepage as root', () => {
    const ids = [`${BASE}/about`, `${BASE}/`];
    const depth = new Map([
      [`${BASE}/about`, 0],
      [`${BASE}/`, 0],
    ]);
    expect(findTreeRoot(ids, depth)).toBe(`${BASE}/`);
  });
});

describe('buildTreeNeighborIndex', () => {
  it('returns parent and children only', () => {
    const idx = buildTreeNeighborIndex([
      { source: 'root', target: 'a' },
      { source: 'root', target: 'b' },
    ]);
    expect(idx.get('root')).toEqual(new Set(['a', 'b']));
    expect(idx.get('a')).toEqual(new Set(['root']));
  });
});
