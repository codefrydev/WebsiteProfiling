'use client';

import { useMemo } from 'react';
import type { PathTreeNode } from '@/types/report';

interface CrawlMapPanelProps {
  tree: PathTreeNode;
  maxNodes?: number;
}

interface MapNode {
  id: string;
  label: string;
  depth: number;
  pages: number;
}

function flattenTree(node: PathTreeNode, depth: number, out: MapNode[], max: number): void {
  if (out.length >= max) return;
  out.push({
    id: node.pathKey || '/',
    label: node.segment || node.pathKey || '/',
    depth,
    pages: node.current?.pages ?? 0,
  });
  for (const child of node.children || []) {
    if (out.length >= max) break;
    flattenTree(child, depth + 1, out, max);
  }
}

export default function CrawlMapPanel({ tree, maxNodes = 48 }: CrawlMapPanelProps) {
  const nodes = useMemo(() => {
    const flat: MapNode[] = [];
    flattenTree(tree, 0, flat, maxNodes);
    return flat;
  }, [tree, maxNodes]);

  const width = 720;
  const height = Math.max(280, nodes.length * 18);
  const maxDepth = Math.max(1, ...nodes.map((n) => n.depth));

  return (
    <div className="rounded-xl border border-default bg-brand-900/40 p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[480px]" role="img" aria-label="Crawl path map">
        {nodes.map((node, i) => {
          const y = 24 + i * 16;
          const x = 16 + (node.depth / maxDepth) * (width - 120);
          const barW = Math.min(200, 20 + node.pages * 4);
          return (
            <g key={node.id}>
              <title>{`${node.id} (${node.pages} pages)`}</title>
              <circle cx={x} cy={y} r={4} className="fill-cyan-500" />
              {node.depth > 0 ? (
                <line x1={x - 24} y1={y} x2={x - 6} y2={y} className="stroke-brand-600" strokeWidth={1} />
              ) : null}
              <text x={x + 10} y={y + 4} className="fill-foreground text-[10px] font-mono">
                {node.label}
              </text>
              <rect x={width - barW - 16} y={y - 5} width={barW} height={10} rx={2} className="fill-blue-500/30" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
