
import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CrawlSegmentsData, PathTreeNode } from '@/types/report';

interface CrawlMapPanelProps {
  tree: PathTreeNode;
  crawlSegments?: CrawlSegmentsData | null;
  selectedPath?: string | null;
  onSelectPath?: (pathKey: string) => void;
  maxNodes?: number;
}

function healthBarClass(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return 'bg-cyan-500/40';
  if (score < 50) return 'bg-red-500/50';
  if (score < 70) return 'bg-amber-500/50';
  return 'bg-emerald-500/50';
}

function barWidth(pages: number, maxPages: number): number {
  if (maxPages <= 0) return 8;
  return Math.max(8, Math.round((pages / maxPages) * 120));
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  selectedPath,
  maxPages,
  onToggle,
  onSelect,
  visibleCount,
  maxNodes,
  healthByPrefix,
}: {
  node: PathTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedPath?: string | null;
  maxPages: number;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  visibleCount: { n: number };
  maxNodes: number;
  healthByPrefix: Map<string, number | null | undefined>;
}) {
  if (visibleCount.n >= maxNodes) return null;
  visibleCount.n += 1;

  const key = node.pathKey || '/';
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isOpen = expanded.has(key);
  const pages = node.current?.pages ?? 0;
  const isSelected = selectedPath === key;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(key)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-brand-800/80 ${
          isSelected ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : ''
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <span
            role="presentation"
            className="shrink-0 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(key);
            }}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="font-mono text-foreground truncate flex-1">{node.segment || key}</span>
        <span className="tabular-nums text-muted-foreground shrink-0">{pages}</span>
        <span
          className={`h-2 rounded-sm shrink-0 ${healthBarClass(healthByPrefix.get(key))}`}
          style={{ width: `${barWidth(pages, maxPages)}px` }}
          aria-hidden
        />
      </button>
      {hasChildren && isOpen
        ? node.children!.map((child) => (
            <TreeNodeRow
              key={child.pathKey}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              maxPages={maxPages}
              onToggle={onToggle}
              onSelect={onSelect}
              visibleCount={visibleCount}
              maxNodes={maxNodes}
              healthByPrefix={healthByPrefix}
            />
          ))
        : null}
    </>
  );
}

function collectMaxPages(node: PathTreeNode): number {
  let max = node.current?.pages ?? 0;
  for (const child of node.children || []) {
    max = Math.max(max, collectMaxPages(child));
  }
  return max;
}

export default function CrawlMapPanel({
  tree,
  crawlSegments = null,
  selectedPath = null,
  onSelectPath,
  maxNodes = 80,
}: CrawlMapPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/']));

  const maxPages = useMemo(() => collectMaxPages(tree), [tree]);
  const healthByPrefix = useMemo(() => {
    const m = new Map<string, number | null | undefined>();
    for (const seg of crawlSegments?.segments || []) {
      const prefix = seg.prefix?.startsWith('/') ? seg.prefix : `/${seg.prefix || ''}`;
      m.set(prefix === '//' ? '/' : prefix.replace(/\/+$/, '') || '/', seg.health_score);
    }
    return m;
  }, [crawlSegments]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const select = useCallback(
    (key: string) => {
      onSelectPath?.(key);
      if (key !== '/') {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add('/');
          next.add(key);
          return next;
        });
      }
    },
    [onSelectPath],
  );

  const counter = { n: 0 };

  return (
    <div className="rounded-xl border border-default bg-brand-900/40 p-4">
      <p className="text-xs text-muted-foreground mb-3">
        Click a path segment to filter the structure tree. Expand nodes to explore depth.
      </p>
      <div className="max-h-[min(520px,60vh)] overflow-y-auto">
        <TreeNodeRow
          node={tree}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          maxPages={maxPages}
          onToggle={toggle}
          onSelect={select}
          visibleCount={counter}
          maxNodes={maxNodes}
          healthByPrefix={healthByPrefix}
        />
      </div>
    </div>
  );
}
