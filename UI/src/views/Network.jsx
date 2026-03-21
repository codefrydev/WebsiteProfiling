import { useState, useEffect, useRef, useMemo } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Maximize, Minimize } from 'lucide-react';
import { useReport } from '../context/useReport';
import { strings } from '../lib/strings';
import { PageLayout, PageHeader, Card, Button } from '../components';

export default function Network({ searchQuery = '' }) {
  const vn = strings.views.network;
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const graphRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { data } = useReport();

  const graphPayload = useMemo(() => {
    if (!data) return null;
    const q = (searchQuery || '').toLowerCase().trim();
    const urlToStatus = {};
    (data.links || []).forEach((l) => { urlToStatus[l.url] = String(l.status); });

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
        nodeMap.set(fromId, { id: fromId, label: String(fromId).replace(/^https?:\/\/[^/]+/, '') || '/', title: fromId, color });
      }
      if (toId && !nodeMap.has(toId)) {
        const st = urlToStatus[toId] || '';
        const color = /^[45]/.test(st) ? '#EF4444' : '#3B82F6';
        nodeMap.set(toId, { id: toId, label: String(toId).replace(/^https?:\/\/[^/]+/, '') || '/', title: toId, color });
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
  }, [data, searchQuery]);

  useEffect(() => {
    if (!data || !containerRef.current || !graphPayload || graphPayload.nodes.length === 0) {
      graphRef.current = null;
      return undefined;
    }

    const graph = ForceGraph3D()(containerRef.current)
      .graphData({ nodes: graphPayload.nodes, links: graphPayload.links })
      .nodeColor((node) => node.color)
      .nodeLabel((node) => node.title || node.id)
      .linkColor(() => 'rgba(148, 163, 184, 0.3)')
      .onNodeClick((node) => node?.id && window.open(node.id, '_blank'))
      .backgroundColor('#05080f');

    graphRef.current = graph;

    return () => {
      graphRef.current = null;
    };
  }, [data, graphPayload]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g || !containerRef.current) return;
    const w = containerRef.current.offsetWidth;
    const h = containerRef.current.offsetHeight;
    if (w && h) g.width(w).height(h);
  }, [isFullscreen, graphPayload]);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

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
      <Card
        overflowHidden
        padding="none"
        className="flex-1 shadow-lg relative min-h-[80vh]"
      >
        {hasGraph ? (
          <>
            <div
              ref={containerRef}
              className="absolute inset-0 w-full h-full bg-[#05080f]"
              style={{ outline: 'none' }}
            />
            {searchEmpty && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#05080f]/90 text-slate-400 text-sm px-6 text-center">
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
                <div className="w-4 h-0.5 bg-slate-600" />
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
          <div className="absolute inset-0 flex items-center justify-center p-5 text-slate-500">
            {vn.noEdges}
          </div>
        )}
      </Card>
      </div>
    </PageLayout>
  );
}
