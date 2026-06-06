import { useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, Home, FileText } from 'lucide-react';
import Table, { TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../Table';
import InlinksMetricCell from '../links/InlinksMetricCell';
import { rtColor } from '../../utils/linkUtils';
import type { PathTreeTableRow } from '@/types/report';

interface ComparePairBarProps {
  current: number;
  baseline: number;
  title?: string;
}

function ComparePairBar({ current, baseline, title }: ComparePairBarProps) {
  const c = Math.max(0, Number(current) || 0);
  const b = Math.max(0, Number(baseline) || 0);
  const t = c + b;
  if (t <= 0) {
    return <span className="text-xs text-muted-foreground tabular-nums">—</span>;
  }
  const pctB = (b / t) * 100;
  const pctC = (c / t) * 100;
  return (
    <div
      className="flex h-1.5 rounded overflow-hidden bg-track min-w-[40px] max-w-[64px] shrink-0 mx-auto"
      title={title}
    >
      <div className="bg-muted-foreground/45" style={{ width: `${pctB}%` }} />
      <div className="bg-blue-500" style={{ width: `${pctC}%` }} />
    </div>
  );
}

function fmtInt(n: unknown): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString();
}

function fmtAvg(n: unknown): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString();
}

function fmtScore(n: unknown): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return String(Math.round(Number(n)));
}

function scoreTextClass(score: unknown): string {
  if (score == null || !Number.isFinite(Number(score))) return 'text-muted-foreground';
  const s = Number(score);
  if (s >= 90) return 'text-green-700 dark:text-green-400 font-semibold';
  if (s >= 50) return 'text-yellow-800 dark:text-yellow-400 font-semibold';
  return 'text-red-600 dark:text-red-400 font-semibold';
}

interface PathTreeTableStrings {
  colPath: string;
  colPages: string;
  colInlinks: string;
  colOutlinks: string;
  colAvgWords: string;
  colAvgRt: string;
  colPerf: string;
  colSeo: string;
  changePagesHint: string;
  changeInlinksHint: string;
  changeTooltipPages: string;
  changeTooltipInlinks: string;
}

interface PathTreeTableProps {
  rows: PathTreeTableRow[];
  expanded: Set<string>;
  onToggle: (pathKey: string) => void;
  hasCompare: boolean;
  showCompareCharts: boolean;
  s: PathTreeTableStrings;
  tableWrapperClassName?: string;
}

const GUIDE_W = 18;

function TreeGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <div className="flex shrink-0 self-stretch pt-3" aria-hidden>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="border-l border-muted-foreground/30"
          style={{ width: GUIDE_W, marginLeft: i === 0 ? 4 : 0 }}
        />
      ))}
    </div>
  );
}

function PathTreeLabel({
  row,
  hasKids,
  isOpen,
  onToggle,
}: {
  row: PathTreeTableRow;
  hasKids: boolean;
  isOpen: boolean;
  onToggle: (pathKey: string) => void;
}) {
  const isRoot = row.pathKey === '/';
  const isLeaf = !hasKids;
  const label = isRoot ? '/' : row.segment;

  return (
    <div className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5">
      {hasKids ? (
        <button
          type="button"
          className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-brand-700 shrink-0 transition-colors"
          aria-expanded={isOpen}
          aria-label={isOpen ? `Collapse ${row.pathKey}` : `Expand ${row.pathKey}`}
          onClick={() => onToggle(row.pathKey)}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      {isRoot ? (
        <Home className="h-3.5 w-3.5 text-link shrink-0" aria-hidden />
      ) : isLeaf ? (
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
      ) : (
        <Folder className={`h-3.5 w-3.5 shrink-0 ${isOpen ? 'text-amber-500' : 'text-amber-600/70'}`} aria-hidden />
      )}
      {hasKids ? (
        <button
          type="button"
          className="truncate font-mono text-sm text-left min-w-0 flex-1 font-medium text-foreground hover:text-link transition-colors"
          title={row.pathKey}
          onClick={() => onToggle(row.pathKey)}
        >
          {label}
        </button>
      ) : (
        <span className="truncate font-mono text-sm text-foreground/90 min-w-0 flex-1" title={row.pathKey}>
          {label}
        </span>
      )}
      {!isRoot ? (
        <span className="hidden xl:inline truncate font-mono text-[10px] text-muted-foreground max-w-[12rem]" title={row.pathKey}>
          {row.pathKey}
        </span>
      ) : null}
      {hasKids && row.current.pages > 0 ? (
        <span className="shrink-0 rounded-md bg-brand-700/80 border border-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {fmtInt(row.current.pages)}
        </span>
      ) : null}
    </div>
  );
}

export default function PathTreeTable({
  rows,
  expanded,
  onToggle,
  hasCompare,
  showCompareCharts,
  s,
  tableWrapperClassName = 'max-h-[min(72vh,calc(100dvh-14rem))] overflow-x-auto overflow-y-auto touch-pan-x overscroll-contain',
}: PathTreeTableProps) {
  const maxInlinks = useMemo(() => {
    let m = 0;
    for (const row of rows) {
      m = Math.max(m, row.current.inlinks ?? 0);
    }
    return m || 1;
  }, [rows]);

  function renderPathCell(row: PathTreeTableRow, rowIndex: number) {
    const hasKids = row.children?.length > 0;
    const isOpen = expanded.has(row.pathKey);
    const rowBg = rowIndex % 2 === 1 ? 'bg-brand-900/40' : 'bg-brand-800';

    return (
      <TableCell
        className={`min-w-[200px] max-w-[min(52vw,28rem)] sticky left-0 z-[1] ${rowBg} border-r border-muted/60 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.35)] py-2.5`}
      >
        <div className="flex items-stretch min-w-0">
          <TreeGuides depth={row.depth} />
          <PathTreeLabel row={row} hasKids={hasKids} isOpen={isOpen} onToggle={onToggle} />
        </div>
      </TableCell>
    );
  }

  function renderMetricCells(row: PathTreeTableRow) {
    const cur = row.current;
    const base = row.baseline;
    const perfScore = cur.avgPerfScore;
    const seoScore = cur.avgSeoScore;

    return (
      <>
        <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">{fmtInt(cur.pages)}</TableCell>
        {hasCompare && showCompareCharts ? (
          <TableCell className="w-14 px-2">
            {base != null ? (
              <ComparePairBar
                current={cur.pages}
                baseline={base.pages}
                title={formatCompareTitle(s.changeTooltipPages, base.pages, cur.pages)}
              />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
        ) : null}
        <TableCell className="text-right align-middle min-w-[5.5rem] px-3">
          <InlinksMetricCell
            count={cur.inlinks ?? 0}
            maxInSection={maxInlinks}
            showIcon={false}
          />
        </TableCell>
        {hasCompare && showCompareCharts ? (
          <TableCell className="w-14 px-2">
            {base != null ? (
              <ComparePairBar
                current={cur.inlinks}
                baseline={base.inlinks}
                title={formatCompareTitle(s.changeTooltipInlinks, base.inlinks, cur.inlinks)}
              />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
        ) : null}
        <TableCell className="hidden md:table-cell text-right tabular-nums whitespace-nowrap">{fmtInt(cur.outlinks)}</TableCell>
        <TableCell className="hidden lg:table-cell text-right tabular-nums whitespace-nowrap">{fmtAvg(cur.avgWordCount)}</TableCell>
        <TableCell className={`text-right tabular-nums whitespace-nowrap text-sm ${rtColor(cur.avgResponseMs)}`}>
          {fmtAvg(cur.avgResponseMs)}
        </TableCell>
        <TableCell className="hidden sm:table-cell text-right tabular-nums whitespace-nowrap">
          <span className={scoreTextClass(perfScore)}>{fmtScore(perfScore)}</span>
        </TableCell>
        <TableCell className="hidden lg:table-cell text-right tabular-nums whitespace-nowrap">
          <span className={scoreTextClass(seoScore)}>{fmtScore(seoScore)}</span>
        </TableCell>
      </>
    );
  }

  return (
    <Table wrapperClassName={tableWrapperClassName}>
      <TableHead sticky>
        <TableRow>
          <TableHeadCell className="min-w-[200px] sticky left-0 z-20 bg-brand-900 border-r border-muted/60 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.35)]">
            {s.colPath}
          </TableHeadCell>
          <TableHeadCell className="text-right whitespace-nowrap">{s.colPages}</TableHeadCell>
          {hasCompare && showCompareCharts ? (
            <TableHeadCell className="w-14 px-2 text-center" title={s.changePagesHint}>
              Δ
            </TableHeadCell>
          ) : null}
          <TableHeadCell className="text-right whitespace-nowrap">{s.colInlinks}</TableHeadCell>
          {hasCompare && showCompareCharts ? (
            <TableHeadCell className="w-14 px-2 text-center" title={s.changeInlinksHint}>
              Δ
            </TableHeadCell>
          ) : null}
          <TableHeadCell className="hidden md:table-cell text-right whitespace-nowrap">{s.colOutlinks}</TableHeadCell>
          <TableHeadCell className="hidden lg:table-cell text-right whitespace-nowrap">{s.colAvgWords}</TableHeadCell>
          <TableHeadCell className="text-right whitespace-nowrap">{s.colAvgRt}</TableHeadCell>
          <TableHeadCell className="hidden sm:table-cell text-right whitespace-nowrap">{s.colPerf}</TableHeadCell>
          <TableHeadCell className="hidden lg:table-cell text-right whitespace-nowrap">{s.colSeo}</TableHeadCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={row.pathKey} className={rowIndex % 2 === 1 ? 'bg-brand-900/30' : undefined}>
            {renderPathCell(row, rowIndex)}
            {renderMetricCells(row)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatCompareTitle(template: string | undefined, b: number, c: number): string {
  if (!template) return `${b} → ${c}`;
  return String(template).replace('{b}', String(b)).replace('{c}', String(c));
}
