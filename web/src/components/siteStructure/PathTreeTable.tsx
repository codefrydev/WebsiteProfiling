import { ChevronRight, ChevronDown, Folder, Home } from 'lucide-react';
import Table, { TableHead, TableHeadCell, TableBody, TableRow, TableCell } from '../Table';
import type { PathTreeTableRow } from '@/types/report';

interface ComparePairBarProps {
  current: number;
  baseline: number;
  title?: string;
}

/**
 * Two-segment bar: baseline (muted) vs current (blue) proportional split.
 */
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
      className="flex h-1.5 rounded overflow-hidden bg-track min-w-[40px] max-w-[64px] shrink-0"
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

interface PathTreeTableProps {
  rows: PathTreeTableRow[];
  expanded: Set<string>;
  onToggle: (pathKey: string) => void;
  hasCompare: boolean;
  showCompareCharts: boolean;
  s: Record<string, string>;
}

export default function PathTreeTable({
  rows,
  expanded,
  onToggle,
  hasCompare,
  showCompareCharts,
  s,
}: PathTreeTableProps) {
  function renderPathCell(row: PathTreeTableRow) {
    const hasKids = row.children?.length > 0;
    const isOpen = expanded.has(row.pathKey);
    const pad = 12 + row.depth * 16;
    return (
      <TableCell className="min-w-[200px] max-w-[min(40vw,28rem)]">
        <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: pad }}>
          {hasKids ? (
            <button
              type="button"
              className="p-0.5 rounded text-muted-foreground hover:text-foreground shrink-0"
              aria-expanded={isOpen}
              onClick={() => onToggle(row.pathKey)}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {row.pathKey === '/' ? (
            <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          ) : (
            <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          )}
          <span className="truncate font-mono text-xs" title={row.pathKey}>
            {row.segment}
          </span>
        </div>
      </TableCell>
    );
  }

  function renderMetricCells(row: PathTreeTableRow) {
    const cur = row.current;
    const base = row.baseline;
    return (
      <>
        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtInt(cur.pages)}</TableCell>
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
        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtInt(cur.inlinks)}</TableCell>
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
        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtInt(cur.outlinks)}</TableCell>
        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtAvg(cur.avgWordCount)}</TableCell>
        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtAvg(cur.avgResponseMs)}</TableCell>
        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtScore(cur.avgPerfScore)}</TableCell>
        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtScore(cur.avgSeoScore)}</TableCell>
      </>
    );
  }

  return (
    <Table wrapperClassName="rounded-xl border border-default max-h-[min(72vh,calc(100vh-14rem))] overflow-y-auto">
      <TableHead sticky>
        <TableRow>
          <TableHeadCell className="min-w-[200px]">{s.colPath}</TableHeadCell>
          <TableHeadCell className="text-right whitespace-nowrap">{s.colPages}</TableHeadCell>
          {hasCompare && showCompareCharts ? (
            <TableHeadCell className="w-14 px-2" title={s.changePagesHint}>
              Δ
            </TableHeadCell>
          ) : null}
          <TableHeadCell className="text-right whitespace-nowrap">{s.colInlinks}</TableHeadCell>
          {hasCompare && showCompareCharts ? (
            <TableHeadCell className="w-14 px-2" title={s.changeInlinksHint}>
              Δ
            </TableHeadCell>
          ) : null}
          <TableHeadCell className="text-right whitespace-nowrap">{s.colOutlinks}</TableHeadCell>
          <TableHeadCell className="text-right whitespace-nowrap">{s.colAvgWords}</TableHeadCell>
          <TableHeadCell className="text-right whitespace-nowrap">{s.colAvgRt}</TableHeadCell>
          <TableHeadCell className="text-right whitespace-nowrap">{s.colPerf}</TableHeadCell>
          <TableHeadCell className="text-right whitespace-nowrap">{s.colSeo}</TableHeadCell>
        </TableRow>
      </TableHead>
      <TableBody striped>
        {rows.map((row) => (
          <TableRow key={row.pathKey}>
            {renderPathCell(row)}
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
