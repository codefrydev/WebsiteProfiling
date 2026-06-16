import { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Maximize, Minimize, ExternalLink, X } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useOptionalUrlInspector } from '@/context/UrlInspectorContext';
import { useSectionData } from '@/hooks/useSectionData';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { shortPath } from '@/lib/linkGraph';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, Button, DataViewLayout, LabelWithHint } from '../components';
import type { GraphEdge, GraphNode, ViewProps } from '@/types';

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

/** After the force simulation runs, 3d-force-graph mutates source/target into node objects. */
interface GraphLinkRuntime {
  source: string | { id?: string };
  target: string | { id?: string };
}

interface GraphPayload {
  nodes: GraphNodeData[];
  links: GraphLinkData[];
  searchActive: boolean;
  totalNodeCount: number;
}

interface ForceGraphInstance {
  _destructor?: () => void;
  width: (w: number) => ForceGraphInstance;
  height: (h: number) => ForceGraphInstance;
  pauseAnimation: () => void;
  resumeAnimation: () => void;
  graphData: (data: { nodes: GraphNodeData[]; links: GraphLinkData[] }) => ForceGraphInstance;
  nodeColor: (fn: (node: GraphNodeData) => string) => ForceGraphInstance;
  nodeLabel: (fn: (node: GraphNodeData) => string) => ForceGraphInstance;
  linkColor: (fn: (link: GraphLinkRuntime) => string) => ForceGraphInstance;
  onNodeClick: (fn: (node: GraphNodeData) => void) => ForceGraphInstance;
  onBackgroundClick: (fn: () => void) => ForceGraphInstance;
  backgroundColor: (color: string) => ForceGraphInstance;
  showNavInfo: (show: boolean) => ForceGraphInstance;
  warmupTicks: (n: number) => ForceGraphInstance;
  cooldownTicks: (n: number) => ForceGraphInstance;
  d3AlphaDecay: (n: number) => ForceGraphInstance;
  d3VelocityDecay: (n: number) => ForceGraphInstance;
  cameraPosition?: (
    pos: { x: number; y: number; z: number },
    lookAt?: unknown,
    ms?: number,
  ) => void;
}

/** Fewer simulation ticks + faster decay for large graphs (less CPU / quicker settle). */
function applyGraphPhysics(
  graph: ForceGraphInstance,
  nodeCount: number,
  linkCount: number,
) {
  const n = nodeCount;
  const l = linkCount;
  if (n > 900 || l > 4000) {
    graph
      .warmupTicks(0)
      .cooldownTicks(70)
      .d3AlphaDecay(0.03)
      .d3VelocityDecay(0.42);
  } else if (n > 400 || l > 1500) {
    graph
      .warmupTicks(2)
      .cooldownTicks(110)
      .d3AlphaDecay(0.026)
      .d3VelocityDecay(0.38);
  } else if (n > 150) {
    graph.cooldownTicks(180).d3AlphaDecay(0.023).d3VelocityDecay(0.35);
  }
}

const BASE_LINK_COLOR = 'rgba(148, 163, 184, 0.3)';
const SELECTED_NODE_COLOR = '#fbbf24';
const DIM_NODE_COLOR = 'rgba(100, 116, 139, 0.12)';
const NEIGHBOR_LINK_COLOR = 'rgba(96, 165, 250, 0.85)';
const DIM_LINK_COLOR = 'rgba(148, 163, 184, 0.05)';

export default function Network({ searchQuery = '' }: ViewProps) {
  const vn = strings.views.network;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraphInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useReport();
  const inspector = useOptionalUrlInspector();
  const structureStatus = useSectionData('structure');
  const linksStatus = useSectionData('links');

  // Refs read by the (long-lived) graph callbacks so they never go stale.
  const selectionRef = useRef<{ id: string; neighbors: Set<string> } | null>(null);
  const neighborIndexRef = useRef<Map<string, Set<string>>>(new Map());
  const openUrlRef = useRef<((url: string) => void) | null>(null);
  const recolorRef = useRef<() => void>(() => {});

  const deferredSearch = useDeferredValue(searchQuery);

  const graphPayload = useMemo((): GraphPayload | null => {
    if (!data) return null;
    const q = (deferredSearch || '').toLowerCase().trim();
    const urlToStatus: Record<string, string> = {};
    (data.links || []).forEach((l) => {
      urlToStatus[l.url] = String(l.status);
    });

    const nodes = (data.graph_nodes || []) as GraphNode[];
    const edges = (data.graph_edges || []) as GraphEdge[];

    if (nodes.length === 0 && edges.length === 0) return null;

    const nodeMap = new Map<string, GraphNodeData>();
    nodes.forEach((u) => {
      const id = typeof u === 'string' ? u : (u.id || u.url || String(u));
      const st = urlToStatus[id] || '';
      const color = /^[45]/.test(st) ? '#EF4444' : /^2/.test(st) ? '#3B82F6' : '#64748b';
      const label = typeof id === 'string' ? (id.replace(/^https?:\/\/[^/]+/, '') || '/') : id;
      nodeMap.set(id, { id, label, title: id, color });
    });
    edges.forEach((e: GraphEdge) => {
      const fromId = e.from ?? e['from'];
      const toId = e.to ?? e['to'];
      if (fromId && !nodeMap.has(fromId)) {
        const st = urlToStatus[fromId] || '';
        const color = /^[45]/.test(st) ? '#EF4444' : '#3B82F6';
        nodeMap.set(fromId, {
          id: fromId,
          label: String(fromId).replace(/^https?:\/\/[^/]+/, '') || '/',
          title: fromId,
          color,
        });
      }
      if (toId && !nodeMap.has(toId)) {
        const st = urlToStatus[toId] || '';
        const color = /^[45]/.test(st) ? '#EF4444' : '#3B82F6';
        nodeMap.set(toId, {
          id: toId,
          label: String(toId).replace(/^https?:\/\/[^/]+/, '') || '/',
          title: toId,
          color,
        });
      }
    });

    let ids = Array.from(nodeMap.keys());
    if (q) {
      ids = ids.filter((id) => String(id).toLowerCase().includes(q));
    }
    const idSet = new Set(ids);
    const graphNodes = ids.map((id) => nodeMap.get(id)).filter((n): n is GraphNodeData => n != null);
    const graphLinks = edges
      .map((e: GraphEdge) => {
        const fromId = e.from ?? e['from'];
        const toId = e.to ?? e['to'];
        return fromId && toId && idSet.has(fromId) && idSet.has(toId)
          ? { source: fromId, target: toId }
          : null;
      })
      .filter((link): link is GraphLinkData => link != null);

    return {
      nodes: graphNodes,
      links: graphLinks,
      searchActive: !!q,
      totalNodeCount: nodeMap.size,
    };
  }, [data, deferredSearch]);

  // Undirected neighbour index for click-to-highlight.
  const neighborIndex = useMemo(() => {
    const m = new Map<string, Set<string>>();
    graphPayload?.links.forEach((l) => {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    });
    return m;
  }, [graphPayload]);

  useEffect(() => {
    neighborIndexRef.current = neighborIndex;
  }, [neighborIndex]);

  useEffect(() => {
    openUrlRef.current = inspector?.openUrl ?? null;
  }, [inspector]);

  const clearSelection = useCallback(() => {
    selectionRef.current = null;
    setSelected(null);
    recolorRef.current();
  }, []);

  useEffect(() => {
    const prev = graphRef.current;
    if (prev?._destructor) {
      try {
        prev._destructor();
      } catch {
        /* ignore */
      }
      graphRef.current = null;
    }
    // Reset any highlight when the graph is rebuilt (e.g. on search).
    selectionRef.current = null;
    setSelected(null);

    if (!data || !containerRef.current || !graphPayload || graphPayload.nodes.length === 0) {
      return undefined;
    }

    const el = containerRef.current;
    type ForceGraphFactory = () => (container: HTMLElement) => ForceGraphInstance;
    const createGraph = ForceGraph3D as unknown as ForceGraphFactory;

    const nodeColorFn = (node: GraphNodeData): string => {
      const sel = selectionRef.current;
      if (!sel) return node.color;
      if (node.id === sel.id) return SELECTED_NODE_COLOR;
      if (sel.neighbors.has(node.id)) return node.color;
      return DIM_NODE_COLOR;
    };
    const linkColorFn = (link: GraphLinkRuntime): string => {
      const sel = selectionRef.current;
      if (!sel) return BASE_LINK_COLOR;
      const s = typeof link.source === 'object' ? link.source?.id : link.source;
      const t = typeof link.target === 'object' ? link.target?.id : link.target;
      return s === sel.id || t === sel.id ? NEIGHBOR_LINK_COLOR : DIM_LINK_COLOR;
    };

    const graph = createGraph()(el)
      .graphData({ nodes: graphPayload.nodes, links: graphPayload.links })
      .nodeColor(nodeColorFn)
      .nodeLabel((node: GraphNodeData) => node.title || node.id)
      .linkColor(linkColorFn)
      .onNodeClick((node: GraphNodeData) => {
        if (!node?.id) return;
        selectionRef.current = {
          id: node.id,
          neighbors: neighborIndexRef.current.get(node.id) || new Set<string>(),
        };
        setSelected(node.id);
        recolorRef.current();
        const open = openUrlRef.current;
        if (open) open(node.id);
        else window.open(node.id, '_blank');
        try {
          const n = node as GraphNodeData & { x?: number; y?: number; z?: number };
          if (graph.cameraPosition && n.x != null && n.y != null && n.z != null) {
            const hyp = Math.hypot(n.x, n.y, n.z) || 1;
            const ratio = 1 + 160 / hyp;
            graph.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: n.z * ratio }, n, 700);
          }
        } catch {
          /* camera focus is best-effort */
        }
      })
      .onBackgroundClick(() => {
        selectionRef.current = null;
        setSelected(null);
        recolorRef.current();
      })
      .backgroundColor('#05080f')
      .showNavInfo(false);

    recolorRef.current = () => {
      graph.nodeColor(nodeColorFn).linkColor(linkColorFn);
    };

    applyGraphPhysics(graph, graphPayload.nodes.length, graphPayload.links.length);

    const w0 = el.offsetWidth;
    const h0 = el.offsetHeight;
    if (w0 && h0) graph.width(w0).height(h0);

    graphRef.current = graph;

    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w && h) graph.width(w).height(h);
    });
    ro.observe(el);

    const onVisibility = () => {
      if (document.hidden) graph.pauseAnimation();
      else graph.resumeAnimation();
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      try {
        graph._destructor?.();
      } catch {
        /* ignore */
      }
      graphRef.current = null;
    };
  }, [data, graphPayload]);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  if (
    structureStatus === 'idle' || structureStatus === 'loading' ||
    linksStatus === 'idle' || linksStatus === 'loading'
  ) {
    return <ViewSectionLoading title={vn.title} />;
  }

  const hasGraph =
    (data?.graph_nodes?.length ?? 0) > 0 || (data?.graph_edges?.length ?? 0) > 0;

  const searchEmpty =
    graphPayload?.searchActive &&
    graphPayload.nodes.length === 0 &&
    graphPayload.totalNodeCount > 0;

  return (
    <PageLayout variant="fullHeight" className="space-y-4">
      <DataViewLayout
        fillHeight
        header={<PageHeader title={vn.title} subtitle={vn.subtitle} className="mb-0" />}
      >
        <div ref={wrapperRef} className="flex-1 flex flex-col min-h-0">
          <Card overflowHidden padding="none" className="flex-1 shadow-lg relative min-h-0">
          {hasGraph ? (
            <>
              <div
                ref={containerRef}
                className="absolute inset-0 w-full h-full bg-[#05080f]"
                style={{ outline: 'none' }}
              />
              {searchEmpty && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#05080f]/90 text-muted-foreground text-sm px-6 text-center">
                  {vn.searchEmpty}
                </div>
              )}
              <div className="absolute top-4 left-4 bg-brand-900 border border-default p-3 rounded-xl text-xs space-y-2 z-10">
                <div className="flex items-center gap-2 text-bright">
                  <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-400" />
                  <LabelWithHint label={vn.legendOk} helpKey="views.network.legendOk" />
                </div>
                <div className="flex items-center gap-2 text-bright">
                  <div className="w-3 h-3 rounded-full bg-red-500 border border-red-400" />
                  <LabelWithHint label={vn.legendBroken} helpKey="views.network.legendBroken" />
                </div>
                <div className="flex items-center gap-2 text-bright">
                  <div className="w-4 h-0.5 bg-brand-700" />
                  <LabelWithHint label={vn.legendLink} helpKey="views.network.legendLink" />
                </div>
                <p className="pt-1 text-[11px] text-muted-foreground border-t border-default">{vn.clickHint}</p>
              </div>
              <Button
                variant="secondary"
                onClick={toggleFullscreen}
                className="absolute top-4 right-4 z-10 print:hidden"
                title={isFullscreen ? vn.titleExitFullscreen : vn.titleFullscreen}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                {isFullscreen ? vn.exitFullscreen : vn.fullscreen}
              </Button>
              {selected && (
                <div className="absolute bottom-4 left-4 z-10 max-w-[min(28rem,80vw)] rounded-xl border border-default bg-brand-900/95 p-3 shadow-lg fade-in">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {vn.selectedLabel}
                    </span>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="inline-flex items-center gap-1 rounded p-0.5 text-muted-foreground hover:text-bright"
                      aria-label={vn.clearSelection}
                      title={vn.clearSelection}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mb-2 break-all font-mono text-xs text-bright" title={selected}>
                    {shortPath(selected) || selected}
                  </p>
                  <a
                    href={selected}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-link hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> {vn.openLive}
                  </a>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-5 text-muted-foreground">
              {vn.noEdges}
            </div>
          )}
        </Card>
        </div>
      </DataViewLayout>
    </PageLayout>
  );
}
