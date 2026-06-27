import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Maximize, Minimize, ExternalLink, X } from 'lucide-react';
import { useReport } from '../context/useReport';
import { useOptionalUrlInspector } from '@/context/UrlInspectorContext';
import { useSectionData } from '@/hooks/useSectionData';
import { useSectionsViewReady } from '@/hooks/useSectionsViewReady';
import { ViewSectionLoading } from '@/components/ViewSectionLoading';
import { D3ForceGraph } from '@/components/charts/d3/D3ForceGraph';
import {
  buildLinkTreePayload,
  buildTreeNeighborIndex,
  cloneLinkGraphPayload,
  shortPath,
  type LinkGraphNode,
  type LinkGraphLink,
} from '@/lib/linkGraph';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, Button, DataViewLayout, LabelWithHint } from '../components';
import type { ViewProps } from '@/types';

import { getCachedClientPreferences, initClientPreferences, patchClientPreferences } from '@/lib/clientPreferences';

type NetworkViewMode = '2d' | '3d';
const VIEW_MODE_STORAGE_KEY = 'network-view-mode';

/** After the force simulation runs, 3d-force-graph mutates source/target into node objects. */
interface GraphLinkRuntime {
  source: string | { id?: string };
  target: string | { id?: string };
}

interface ForceGraphInstance {
  _destructor?: () => void;
  width: (w: number) => ForceGraphInstance;
  height: (h: number) => ForceGraphInstance;
  pauseAnimation: () => void;
  resumeAnimation: () => void;
  graphData: (data: { nodes: LinkGraphNode[]; links: LinkGraphLink[] }) => ForceGraphInstance;
  nodeColor: (fn: (node: LinkGraphNode) => string) => ForceGraphInstance;
  nodeLabel: (fn: (node: LinkGraphNode) => string) => ForceGraphInstance;
  linkColor: (fn: (link: GraphLinkRuntime) => string) => ForceGraphInstance;
  onNodeClick: (fn: (node: LinkGraphNode) => void) => ForceGraphInstance;
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
  const [viewMode, setViewMode] = useState<NetworkViewMode>(() =>
    typeof window !== 'undefined' ? getCachedClientPreferences().networkViewMode : '2d',
  );
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useReport();
  const inspector = useOptionalUrlInspector();
  useSectionData('structure');
  useSectionData('links');
  const networkReady = useSectionsViewReady(['structure', 'links']);

  const selectionRef = useRef<{ id: string; neighbors: Set<string> } | null>(null);
  const neighborIndexRef = useRef<Map<string, Set<string>>>(new Map());
  const openUrlRef = useRef<((url: string) => void) | null>(null);
  const recolorRef = useRef<() => void>(() => {});

  const deferredSearch = useDeferredValue(searchQuery);

  useEffect(() => {
    void initClientPreferences().then((prefs) => {
      setViewMode(prefs.networkViewMode);
    });
  }, []);

  const setViewModePersisted = useCallback((mode: NetworkViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    patchClientPreferences({ networkViewMode: mode });
  }, []);

  const graphPayload = useMemo(() => {
    if (!data) return null;
    return buildLinkTreePayload(
      data.graph_nodes || [],
      data.graph_edges || [],
      data.links || [],
      deferredSearch,
    );
  }, [data, deferredSearch]);

  /** Fresh copy per render so 3D force-graph cannot mutate shared link endpoints. */
  const renderGraph = useMemo(
    () => (graphPayload ? cloneLinkGraphPayload(graphPayload) : null),
    [graphPayload],
  );

  const neighborIndex = useMemo(
    () => buildTreeNeighborIndex(renderGraph?.links || graphPayload?.links || []),
    [renderGraph, graphPayload],
  );

  const selectedNeighbors = useMemo(() => {
    if (!selected) return null;
    return neighborIndex.get(selected) || new Set<string>();
  }, [selected, neighborIndex]);

  useEffect(() => {
    neighborIndexRef.current = neighborIndex;
  }, [neighborIndex]);

  useEffect(() => {
    openUrlRef.current = inspector?.openUrl ?? null;
  }, [inspector]);

  const handleNodeSelect = useCallback(
    (id: string) => {
      selectionRef.current = {
        id,
        neighbors: neighborIndexRef.current.get(id) || new Set<string>(),
      };
      setSelected(id);
      recolorRef.current();
      const open = openUrlRef.current;
      if (open) open(id);
      else window.open(id, '_blank');
    },
    [],
  );

  const clearSelection = useCallback(() => {
    selectionRef.current = null;
    setSelected(null);
    recolorRef.current();
  }, []);

  useLayoutEffect(() => {
    if (viewMode !== '3d') {
      const prev = graphRef.current;
      if (prev?._destructor) {
        try {
          prev._destructor();
        } catch {
          /* ignore */
        }
        graphRef.current = null;
      }
      return undefined;
    }

    const prev = graphRef.current;
    if (prev?._destructor) {
      try {
        prev._destructor();
      } catch {
        /* ignore */
      }
      graphRef.current = null;
    }

    if (!data || !containerRef.current || !renderGraph || renderGraph.nodes.length === 0) {
      return undefined;
    }

    const el = containerRef.current;
    const graphData = cloneLinkGraphPayload(renderGraph);
    type ForceGraphFactory = () => (container: HTMLElement) => ForceGraphInstance;
    const createGraph = ForceGraph3D as unknown as ForceGraphFactory;

    const nodeColorFn = (node: LinkGraphNode): string => {
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
      .graphData({ nodes: graphData.nodes, links: graphData.links })
      .nodeColor(nodeColorFn)
      .nodeLabel((node: LinkGraphNode) => node.title || node.id)
      .linkColor(linkColorFn)
      .onNodeClick((node: LinkGraphNode) => {
        if (!node?.id) return;
        handleNodeSelect(node.id);
        try {
          const n = node as LinkGraphNode & { x?: number; y?: number; z?: number };
          if (graph.cameraPosition && n.x != null && n.y != null && n.z != null) {
            const hyp = Math.hypot(n.x, n.y, n.z) || 1;
            const ratio = 1 + 160 / hyp;
            graph.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: n.z * ratio }, n, 700);
          }
        } catch {
          /* camera focus is best-effort */
        }
      })
      .onBackgroundClick(clearSelection)
      .backgroundColor('#05080f')
      .showNavInfo(false);

    recolorRef.current = () => {
      graph.nodeColor(nodeColorFn).linkColor(linkColorFn);
    };

    applyGraphPhysics(graph, graphData.nodes.length, graphData.links.length);

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
  }, [data, renderGraph, viewMode, handleNodeSelect, clearSelection]);

  useEffect(() => {
    selectionRef.current = null;
    setSelected(null);
  }, [graphPayload]);

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

  if (!networkReady) {
    return <ViewSectionLoading title={vn.title} />;
  }

  const hasGraph =
    (data?.graph_nodes?.length ?? 0) > 0 || (data?.graph_edges?.length ?? 0) > 0;

  const searchEmpty =
    graphPayload?.searchActive &&
    graphPayload.nodes.length === 0 &&
    graphPayload.totalNodeCount > 0;

  const clickHint = viewMode === '2d' ? vn.clickHint2d : vn.clickHint;

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
              {viewMode === '2d' ? (
                renderGraph && renderGraph.nodes.length > 0 ? (
                  <D3ForceGraph
                    nodes={renderGraph.nodes}
                    links={renderGraph.links}
                    selectedId={selected}
                    neighborIds={selectedNeighbors}
                    onNodeClick={handleNodeSelect}
                    onBackgroundClick={clearSelection}
                    className="absolute inset-0 w-full h-full bg-[#05080f]"
                  />
                ) : null
              ) : (
                <div
                  ref={containerRef}
                  className="absolute inset-0 w-full h-full bg-[#05080f]"
                  style={{ outline: 'none' }}
                />
              )}
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
                <p className="pt-1 text-[11px] text-muted-foreground border-t border-default">{clickHint}</p>
              </div>
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2 print:hidden">
                <div
                  className="flex rounded-lg border border-default overflow-hidden bg-brand-900"
                  role="group"
                  aria-label="Graph view mode"
                >
                  <button
                    type="button"
                    onClick={() => setViewModePersisted('2d')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === '2d'
                        ? 'bg-brand-700 text-bright'
                        : 'text-muted-foreground hover:text-bright'
                    }`}
                    aria-pressed={viewMode === '2d'}
                  >
                    {vn.view2d}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewModePersisted('3d')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-default ${
                      viewMode === '3d'
                        ? 'bg-brand-700 text-bright'
                        : 'text-muted-foreground hover:text-bright'
                    }`}
                    aria-pressed={viewMode === '3d'}
                  >
                    {vn.view3d}
                  </button>
                </div>
                <Button
                  variant="secondary"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? vn.titleExitFullscreen : vn.titleFullscreen}
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  {isFullscreen ? vn.exitFullscreen : vn.fullscreen}
                </Button>
              </div>
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
