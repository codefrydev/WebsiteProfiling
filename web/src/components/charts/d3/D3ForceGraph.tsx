'use client';

import { useEffect, useRef } from 'react';
import { hierarchy, tree, select, zoom, type HierarchyNode, type HierarchyPointNode, type ZoomBehavior } from 'd3';
import { ChartAccessibleFallback } from '../ChartAccessibleFallback';
import { linkEndpointId, type LinkGraphLink, type LinkGraphNode } from '@/lib/linkGraph';

const BASE_LINK_COLOR = 'rgba(148, 163, 184, 0.35)';
const SELECTED_NODE_COLOR = '#fbbf24';
const DIM_NODE_COLOR = 'rgba(100, 116, 139, 0.12)';
const NEIGHBOR_LINK_COLOR = 'rgba(96, 165, 250, 0.85)';
const DIM_LINK_COLOR = 'rgba(148, 163, 184, 0.05)';

interface TreeDatum extends LinkGraphNode {
  children?: TreeDatum[];
}

interface LayoutNode extends LinkGraphNode {
  treeX: number;
  treeY: number;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
}

export interface D3ForceGraphProps {
  nodes: LinkGraphNode[];
  links: LinkGraphLink[];
  selectedId: string | null;
  neighborIds: Set<string> | null;
  onNodeClick: (id: string) => void;
  onBackgroundClick: () => void;
  className?: string;
}

function nodeFill(node: LinkGraphNode, selectedId: string | null, neighborIds: Set<string> | null): string {
  if (!selectedId) return node.color;
  if (node.id === selectedId) return SELECTED_NODE_COLOR;
  if (neighborIds?.has(node.id)) return node.color;
  return DIM_NODE_COLOR;
}

function linkStroke(link: LayoutLink, selectedId: string | null): string {
  if (!selectedId) return BASE_LINK_COLOR;
  return link.source.id === selectedId || link.target.id === selectedId
    ? NEIGHBOR_LINK_COLOR
    : DIM_LINK_COLOR;
}

function buildHierarchy(nodes: LinkGraphNode[], links: LinkGraphLink[]): HierarchyNode<TreeDatum> | null {
  if (nodes.length === 0) return null;

  const nodeById = new Map(nodes.map((n) => [n.id, { ...n, children: [] as TreeDatum[] }]));
  const childIds = new Set<string>();

  for (const l of links) {
    const source = linkEndpointId(l.source as string | { id?: string });
    const target = linkEndpointId(l.target as string | { id?: string });
    const parent = nodeById.get(source);
    const child = nodeById.get(target);
    if (!parent || !child || source === target) continue;
    parent.children!.push(child);
    childIds.add(target);
  }

  let rootEntry = [...nodeById.values()].find((n) => !childIds.has(n.id));
  if (!rootEntry) rootEntry = nodeById.get(nodes[0]!.id);

  // Orphans (no tree parent) become direct children of root.
  for (const n of nodes) {
    if (n.id === rootEntry?.id || childIds.has(n.id)) continue;
    const orphan = nodeById.get(n.id);
    if (orphan && rootEntry) rootEntry.children!.push(orphan);
  }

  if (!rootEntry) return null;

  const stripEmpty = (node: TreeDatum): TreeDatum => ({
    ...node,
    children: node.children?.length ? node.children.map(stripEmpty) : undefined,
  });

  return hierarchy(stripEmpty(rootEntry));
}

function layoutTree(
  root: HierarchyNode<TreeDatum>,
  width: number,
  height: number,
): { layoutNodes: LayoutNode[]; layoutLinks: LayoutLink[] } {
  const radius = Math.max(Math.min(width, height) / 2 - 40, 80);
  const treeLayout = tree<TreeDatum>().size([2 * Math.PI, radius]).separation((a, b) => {
    if (a.parent === b.parent) return 1.2;
    return 2.4 / Math.max(a.depth, 1);
  });

  const laidOut = treeLayout(root) as HierarchyPointNode<TreeDatum>;
  const cx = width / 2;
  const cy = height / 2;

  const layoutNodes: LayoutNode[] = laidOut.descendants().map((d) => ({
    ...d.data,
    treeX: cx + d.y * Math.cos(d.x - Math.PI / 2),
    treeY: cy + d.y * Math.sin(d.x - Math.PI / 2),
  }));

  const byId = new Map(layoutNodes.map((n) => [n.id, n]));
  const layoutLinks: LayoutLink[] = laidOut
    .links()
    .map((l) => {
      const source = byId.get((l.source.data as TreeDatum).id);
      const target = byId.get((l.target.data as TreeDatum).id);
      return source && target ? { source, target } : null;
    })
    .filter((l): l is LayoutLink => l != null);

  return { layoutNodes, layoutLinks };
}

export function D3ForceGraph({
  nodes,
  links,
  selectedId,
  neighborIds,
  onNodeClick,
  onBackgroundClick,
  className,
}: D3ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  const selectedRef = useRef({ selectedId, neighborIds });

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onBackgroundClickRef.current = onBackgroundClick;
  }, [onNodeClick, onBackgroundClick]);

  useEffect(() => {
    selectedRef.current = { selectedId, neighborIds };
    const svg = svgRef.current;
    if (!svg) return;
    const root = select(svg);
    root
      .selectAll<SVGCircleElement, LayoutNode>('circle')
      .attr('fill', (d) => nodeFill(d, selectedId, neighborIds));
    root
      .selectAll<SVGLineElement, LayoutLink>('line')
      .attr('stroke', (d) => linkStroke(d, selectedId));
  }, [selectedId, neighborIds]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || nodes.length === 0) return undefined;

    const render = () => {
      select(el).selectAll('*').remove();

      const width = el.clientWidth || 800;
      const height = el.clientHeight || 600;
      const hRoot = buildHierarchy(nodes, links);
      if (!hRoot) return;

      const { layoutNodes, layoutLinks } = layoutTree(hRoot, width, height);

      const svg = select(el)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('role', 'img')
        .attr('aria-label', `Site structure tree with ${layoutNodes.length} pages`)
        .style('cursor', 'grab');

      svgRef.current = svg.node();

      const g = svg.append('g');

      const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.08, 6])
        .on('zoom', (event) => {
          g.attr('transform', event.transform.toString());
        });

      svg.call(zoomBehavior).on('dblclick.zoom', null);

      svg.on('click', (event) => {
        if (event.target === svg.node()) onBackgroundClickRef.current();
      });

      g.append('g')
        .attr('stroke-width', 1)
        .selectAll<SVGLineElement, LayoutLink>('line')
        .data(layoutLinks)
        .join('line')
        .attr('x1', (d) => d.source.treeX)
        .attr('y1', (d) => d.source.treeY)
        .attr('x2', (d) => d.target.treeX)
        .attr('y2', (d) => d.target.treeY)
        .attr('stroke', (d) => linkStroke(d, selectedRef.current.selectedId));

      g.append('g')
        .selectAll<SVGCircleElement, LayoutNode>('circle')
        .data(layoutNodes)
        .join('circle')
        .attr('r', layoutNodes.length > 400 ? 3.5 : 4.5)
        .attr('cx', (d) => d.treeX)
        .attr('cy', (d) => d.treeY)
        .attr('fill', (d) =>
          nodeFill(d, selectedRef.current.selectedId, selectedRef.current.neighborIds),
        )
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 0.75)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          onNodeClickRef.current(d.id);
        })
        .append('title')
        .text((d) => d.title || d.id);
    };

    render();

    const ro = new ResizeObserver(() => render());
    ro.observe(el);

    return () => {
      ro.disconnect();
      svgRef.current = null;
      select(el).selectAll('*').remove();
    };
  }, [nodes, links]);

  const summary = `Site structure tree: ${nodes.length} pages, ${links.length} crawl paths.`;

  return (
    <ChartAccessibleFallback summary={summary}>
      <div ref={containerRef} className={className} style={{ outline: 'none' }} />
    </ChartAccessibleFallback>
  );
}
