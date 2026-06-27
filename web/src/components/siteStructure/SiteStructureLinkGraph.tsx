
import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import ForceGraph3D from '3d-force-graph';
import { useReport } from '@/context/useReport';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import type { GraphEdge, GraphNode } from '@/types';

const MAX_NODES = 200;

interface GraphNodeData {
  id: string;
  label: string;
  title: string;
  color: string;
}

interface GraphLinkData {
  source: string;
  target: string;
}

interface ForceGraphInstance {
  _destructor?: () => void;
  width: (w: number) => ForceGraphInstance;
  height: (h: number) => ForceGraphInstance;
  graphData: (data: { nodes: GraphNodeData[]; links: GraphLinkData[] }) => ForceGraphInstance;
  nodeColor: (fn: (node: GraphNodeData) => string) => ForceGraphInstance;
  nodeLabel: (fn: (node: GraphNodeData) => string) => ForceGraphInstance;
  linkColor: (fn: () => string) => ForceGraphInstance;
  onNodeClick: (fn: (node: GraphNodeData) => void) => ForceGraphInstance;
  backgroundColor: (color: string) => ForceGraphInstance;
}

export default function SiteStructureLinkGraph() {
  const { data } = useReport();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraphInstance | null>(null);

  const graphData = useMemo(() => {
    if (!data) return null;
    const urlToStatus: Record<string, string> = {};
    (data.links || []).forEach((l) => {
      urlToStatus[l.url] = String(l.status);
    });
    const nodes = (data.graph_nodes || []) as GraphNode[];
    const edges = (data.graph_edges || []) as GraphEdge[];
    if (!nodes.length && !edges.length) return null;

    const nodeMap = new Map<string, GraphNodeData>();
    nodes.slice(0, MAX_NODES).forEach((u) => {
      const id = typeof u === 'string' ? u : (u.id || u.url || String(u));
      const st = urlToStatus[id] || '';
      const color = /^[45]/.test(st) ? '#EF4444' : /^2/.test(st) ? '#3B82F6' : '#64748b';
      const label = String(id).replace(/^https?:\/\/[^/]+/, '') || '/';
      nodeMap.set(id, { id, label, title: id, color });
    });
    const idSet = new Set(nodeMap.keys());
    const links = edges
      .map((e) => {
        const fromId = e.from ?? e['from'];
        const toId = e.to ?? e['to'];
        return fromId && toId && idSet.has(fromId) && idSet.has(toId)
          ? { source: fromId, target: toId }
          : null;
      })
      .filter((l): l is GraphLinkData => l != null);

    return {
      nodes: [...nodeMap.values()],
      links,
      total: nodes.length,
    };
  }, [data]);

  const graphDevData = useMemo(
    () =>
      graphData
        ? {
            widget: 'siteStructure.graph',
            nodeCount: graphData.nodes.length,
            linkCount: graphData.links.length,
            totalNodes: graphData.total,
            nodes: graphData.nodes,
            links: graphData.links,
          }
        : { widget: 'siteStructure.graph', nodes: [], links: [], totalNodes: 0 },
    [graphData],
  );

  useEffect(() => {
    const prev = graphRef.current;
    if (prev?._destructor) {
      try {
        prev._destructor();
      } catch {
        /* ignore */
      }
    }
    graphRef.current = null;

    if (!containerRef.current || !graphData) return;

    const el = containerRef.current;
    type ForceGraphFactory = () => (container: HTMLElement) => ForceGraphInstance & {
      graphData: (data: { nodes: GraphNodeData[]; links: GraphLinkData[] }) => ForceGraphInstance & Record<string, unknown>;
      nodeColor: (fn: (node: GraphNodeData) => string) => ForceGraphInstance & Record<string, unknown>;
      nodeLabel: (fn: (node: GraphNodeData) => string) => ForceGraphInstance & Record<string, unknown>;
      linkColor: (fn: () => string) => ForceGraphInstance & Record<string, unknown>;
      onNodeClick: (fn: (node: GraphNodeData) => void) => ForceGraphInstance & Record<string, unknown>;
      backgroundColor: (color: string) => ForceGraphInstance & Record<string, unknown>;
      width: (w: number) => ForceGraphInstance & Record<string, unknown>;
      height: (h: number) => ForceGraphInstance & Record<string, unknown>;
      _destructor?: () => void;
    };
    const createGraph = ForceGraph3D as unknown as ForceGraphFactory;
    const graph = createGraph()(el)
      .width(el.clientWidth)
      .height(360)
      .graphData(graphData)
      .nodeColor((node: GraphNodeData) => node.color)
      .nodeLabel((node: GraphNodeData) => node.label)
      .linkColor(() => 'rgba(148,163,184,0.35)')
      .backgroundColor('rgba(15,23,42,0.2)')
      .onNodeClick((node: GraphNodeData) => {
        if (node?.id) window.open(node.id, '_blank');
      });

    graphRef.current = graph;

    return () => {
      if (graph?._destructor) {
        try {
          graph._destructor();
        } catch {
          /* ignore */
        }
      }
    };
  }, [graphData]);

  if (!graphData) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No link graph data in this report.</p>;
  }

  return (
    <div className="relative group/dev-card space-y-3">
      <DevCopyJsonButton data={graphDevData} />
      <p className="text-xs text-muted-foreground">
        Showing up to {MAX_NODES} of {graphData.total} nodes. Click a node to open the URL.{' '}
        <Link to="/network" className="text-link hover:underline">
          Open full Network view
        </Link>
      </p>
      <div ref={containerRef} className="h-[360px] w-full rounded-xl border border-default overflow-hidden" />
    </div>
  );
}
