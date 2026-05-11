import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Maximize, Minimize, Loader2 } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, Button } from '../components';

/** Fewer simulation ticks + faster decay for large graphs (less CPU / quicker settle). */
function applyGraphPhysics(graph, nodeCount, linkCount) {
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

export default function Network({ searchQuery = '' }) {
  const vn = strings.views.network;
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const graphRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { data, loading } = useReport();

  const deferredSearch = useDeferredValue(searchQuery);

  const graphPayload = useMemo(() => {
    if (!data) return null;
    const q = (deferredSearch || '').toLowerCase().trim();
    const urlToStatus = {};
    (data.links || []).forEach((l) => {
      urlToStatus[l.url] = String(l.status);
    });

    const nodes = data.graph_nodes || [];
    const edges = data.graph_edges || [];

    if (nodes.length === 0 && edges.length === 0) return null;

    const nodeMap = new Map();
    nodes.forEach((u) => {
      const id = typeof u === 'string' ? u : (u.id || u.url || String(u));
      const st = urlToStatus[id] || '';
      const color = /^[45]/.test(st) ? '#EF4444' : /^2/.test(st) ? '#3B82F6' : '#64748b';
      const label = typeof id === 'string' ? (id.replace(/^https?:\/\/[^/]+/, '') || '/') : id;
      nodeMap.set(id, { id, label, title: id, color });
    });
    edges.forEach((e) => {
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
    const graphNodes = ids.map((id) => nodeMap.get(id));
    const graphLinks = edges
      .map((e) => {
        const fromId = e.from ?? e['from'];
        const toId = e.to ?? e['to'];
        return fromId && toId && idSet.has(fromId) && idSet.has(toId)
          ? { source: fromId, target: toId }
          : null;
      })
      .filter(Boolean);

    return {
      nodes: graphNodes,
      links: graphLinks,
      searchActive: !!q,
      totalNodeCount: nodeMap.size,
    };
  }, [data, deferredSearch]);

  useEffect(() => {
    const prev = graphRef.current;
    if (prev) {
      try {
        prev._destructor();
      } catch {
        /* ignore */
      }
      graphRef.current = null;
    }

    if (!data || !containerRef.current || !graphPayload || graphPayload.nodes.length === 0) {
      return undefined;
    }

    const el = containerRef.current;
    const graph = ForceGraph3D()(el)
      .graphData({ nodes: graphPayload.nodes, links: graphPayload.links })
      .nodeColor((node) => node.color)
      .nodeLabel((node) => node.title || node.id)
      .linkColor(() => 'rgba(148, 163, 184, 0.3)')
      .onNodeClick((node) => node?.id && window.open(node.id, '_blank'))
      .backgroundColor('#05080f')
      .showNavInfo(false);

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
        graph._destructor();
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

  if (loading) {
    return (
      <PageLayout className="flex flex-col h-full">
        <PageHeader title={vn.title} subtitle={vn.subtitle} />
        <Card className="flex-1 min-h-[50vh] flex flex-col items-center justify-center gap-4 border-dashed">
          <Loader2 className="h-10 w-10 animate-spin text-link" aria-hidden />
          <p className="text-muted-foreground">{strings.app.loading}</p>
        </Card>
      </PageLayout>
    );
  }

  if (!data) return null;

  const hasGraph =
    (data.graph_nodes && data.graph_nodes.length > 0) || (data.graph_edges && data.graph_edges.length > 0);

  const searchEmpty =
    graphPayload?.searchActive &&
    graphPayload.nodes.length === 0 &&
    graphPayload.totalNodeCount > 0;

  return (
    <PageLayout className="flex flex-col h-full">
      <PageHeader title={vn.title} subtitle={vn.subtitle} />
      <div ref={wrapperRef} className="flex-1 flex flex-col min-h-[80vh]">
        <Card overflowHidden padding="none" className="flex-1 shadow-lg relative min-h-[80vh]">
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
                  {vn.legendOk}
                </div>
                <div className="flex items-center gap-2 text-bright">
                  <div className="w-3 h-3 rounded-full bg-red-500 border border-red-400" />
                  {vn.legendBroken}
                </div>
                <div className="flex items-center gap-2 text-bright">
                  <div className="w-4 h-0.5 bg-brand-700" />
                  {vn.legendLink}
                </div>
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
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-5 text-muted-foreground">
              {vn.noEdges}
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
