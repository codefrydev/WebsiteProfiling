import { useState, useEffect, useRef } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Maximize, Minimize } from 'lucide-react';
import { useReport } from '../context/useReport';

export default function Network() {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const graphRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { data } = useReport();

  useEffect(() => {
    if (!data || !containerRef.current) return;

    const urlToStatus = {};
    (data.links || []).forEach((l) => { urlToStatus[l.url] = String(l.status); });

    const nodes = data.graph_nodes || [];
    const edges = data.graph_edges || [];

    if (nodes.length === 0 && edges.length === 0) return;

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

    const graphData = {
      nodes: Array.from(nodeMap.values()),
      links: edges
        .map((e) => {
          const fromId = e.from ?? e['from'];
          const toId = e.to ?? e['to'];
          return fromId && toId ? { source: fromId, target: toId } : null;
        })
        .filter(Boolean),
    };

    const graph = ForceGraph3D()(containerRef.current)
      .graphData(graphData)
      .nodeColor((node) => node.color)
      .nodeLabel((node) => node.title || node.id)
      .linkColor(() => 'rgba(148, 163, 184, 0.3)')
      .onNodeClick((node) => node?.id && window.open(node.id, '_blank'))
      .backgroundColor('#05080f');

    graphRef.current = graph;

    return () => {
      graphRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    const g = graphRef.current;
    if (!g || !containerRef.current) return;
    const w = containerRef.current.offsetWidth;
    const h = containerRef.current.offsetHeight;
    if (w && h) g.width(w).height(h);
  }, [isFullscreen]);

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

  return (
    <div className="p-6 lg:p-8 flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-white mb-2">Site Architecture Topology</h1>
        <p className="text-slate-400">
          Physics-based simulation of internal linking. Red nodes indicate 4xx/5xx.
        </p>
      </div>
      <div
        ref={wrapperRef}
        className="flex-1 bg-brand-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg relative min-h-[80vh]"
      >
        {hasGraph ? (
          <>
            <div
              ref={containerRef}
              className="absolute inset-0 w-full h-full bg-[#05080f]"
              style={{ outline: 'none' }}
            />
            <div className="absolute top-4 left-4 bg-brand-900/80 backdrop-blur border border-slate-700 p-3 rounded-lg text-xs space-y-2 z-10">
              <div className="flex items-center gap-2 text-white">
                <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-400" />
                OK (2xx)
              </div>
              <div className="flex items-center gap-2 text-white">
                <div className="w-3 h-3 rounded-full bg-red-500 border border-red-400" />
                Broken (4xx/5xx)
              </div>
              <div className="flex items-center gap-2 text-white">
                <div className="w-4 h-0.5 bg-slate-600" />
                Internal Link
              </div>
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 z-10 px-3 py-2 rounded-lg bg-brand-900/80 backdrop-blur border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition-colors print:hidden"
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              {isFullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-5 text-slate-500">
            No edge data available.
          </div>
        )}
      </div>
    </div>
  );
}
