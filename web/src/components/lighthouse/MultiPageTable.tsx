import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import type { MultiPageMetricCol, MultiPageTableRow } from '@/types/report';
import { scoreColor, metricStatus, formatMetric } from '../../utils/lighthouseUtils';

interface MetricColDef {
  id: MultiPageMetricCol;
  label: string;
  isScore: boolean;
  fmt?: (v: number | null) => string;
}

const COLS: MetricColDef[] = [
  { id: 'performance',    label: 'Perf',   isScore: true },
  { id: 'accessibility',  label: 'A11y',   isScore: true },
  { id: 'seo',            label: 'SEO',    isScore: true },
  { id: 'best-practices', label: 'Best P.',isScore: true },
  { id: 'lcp_ms', label: 'LCP', isScore: false, fmt: (v) => formatMetric('lcp_ms', v) },
  { id: 'cls',    label: 'CLS', isScore: false, fmt: (v) => formatMetric('cls',    v) },
  { id: 'tbt_ms', label: 'TBT', isScore: false, fmt: (v) => formatMetric('tbt_ms', v) },
  { id: 'fcp_ms', label: 'FCP', isScore: false, fmt: (v) => formatMetric('fcp_ms', v) },
];

function scoreTip(score: number): string {
  if (score >= 90) return 'Good (90–100)';
  if (score >= 50) return 'Needs Work (50–89)';
  return 'Poor (0–49)';
}

function scoreRowBg(perf: number | null): string {
  if (perf == null) return '';
  if (perf >= 90) return 'bg-md-sys-success-container/10 hover:bg-md-sys-success-container/20';
  if (perf >= 50) return 'bg-md-sys-warning-container/10 hover:bg-md-sys-warning-container/20';
  return 'bg-md-sys-error-container/10 hover:bg-md-sys-error-container/20';
}

export interface MultiPageTableProps {
  byUrl: Record<string, Record<string, unknown>>;
  selectedUrl?: string | null;
  onSelect?: (url: string) => void;
}

export default function MultiPageTable({ byUrl, selectedUrl, onSelect }: MultiPageTableProps) {
  const [sortCol, setSortCol] = useState<MultiPageMetricCol>('performance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const rows = useMemo((): MultiPageTableRow[] => Object.entries(byUrl).map(([url, d]) => {
    const cs = (d.category_scores || {}) as Record<string, unknown>;
    const mm = (d.median_metrics || {}) as Record<string, unknown>;
    return {
      url,
      performance:    cs.performance    != null ? Number(cs.performance)    : null,
      accessibility:  cs.accessibility  != null ? Number(cs.accessibility)  : null,
      seo:            cs.seo            != null ? Number(cs.seo)            : null,
      'best-practices': cs['best-practices'] != null ? Number(cs['best-practices']) : null,
      lcp_ms: mm.lcp_ms != null ? Number(mm.lcp_ms) : null,
      cls:    mm.cls    != null ? Number(mm.cls)    : null,
      tbt_ms: mm.tbt_ms != null ? Number(mm.tbt_ms) : null,
      fcp_ms: mm.fcp_ms != null ? Number(mm.fcp_ms) : null,
    };
  }), [byUrl]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const va = a[sortCol] ?? -1;
    const vb = b[sortCol] ?? -1;
    const na = typeof va === 'number' ? va : -1;
    const nb = typeof vb === 'number' ? vb : -1;
    return sortDir === 'asc' ? na - nb : nb - na;
  }), [rows, sortCol, sortDir]);

  const handleSort = (col: MultiPageMetricCol): void => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-md-sys-surface-container-low text-xs uppercase text-md-sys-on-surface-variant">
          <tr>
            <th className="px-4 py-3 text-left">URL</th>
            {COLS.map((c) => (
              <th
                key={c.id}
                className="px-3 py-3 cursor-pointer hover:text-md-sys-on-surface select-none"
                onClick={() => handleSort(c.id)}
              >
                <div className="flex items-center gap-1 justify-center">
                  {c.label}
                  {sortCol === c.id
                    ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                    : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-md-sys-outline-variant/40">
          {sorted.map((row, i) => {
            const isSelected = selectedUrl === row.url;
            return (
              <tr
                key={i}
                onClick={() => onSelect?.(row.url)}
                className={`cursor-pointer transition-colors ${scoreRowBg(row.performance)} ${isSelected ? 'ring-2 ring-inset ring-md-sys-primary' : ''}`}
              >
                <td className="px-4 py-3 font-mono text-md-sys-primary text-xs max-w-[250px] truncate" title={row.url}>
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.url}
                  </a>
                </td>
                {COLS.map((c) => {
                  const val = row[c.id];
                  const cellId = `${i}-${c.id}`;
                  const mStatus = !c.isScore ? metricStatus(c.id, val) : null;
                  const metricColor =
                    mStatus === 'good'
                      ? 'text-md-sys-success'
                      : mStatus === 'warn'
                        ? 'text-md-sys-warning'
                        : 'text-md-sys-error';
                  return (
                    <td
                      key={c.id}
                      className="px-3 py-3 text-center relative"
                      onMouseEnter={() => setHoveredCell(cellId)}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {c.isScore ? (
                        <span
                          className="font-bold text-sm"
                          style={{ color: val != null ? scoreColor(val) : 'rgb(71,85,105)' }}
                        >
                          {val != null ? val : '—'}
                        </span>
                      ) : (
                        <span className={`text-xs font-mono ${val != null ? metricColor : 'text-md-sys-on-surface-variant'}`}>
                          {val != null && c.fmt ? c.fmt(val) : '—'}
                        </span>
                      )}
                      {hoveredCell === cellId && c.isScore && val != null && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-md-sys-surface-container border border-md-sys-outline-variant/40 text-xs text-md-sys-on-surface px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none">
                          {scoreTip(val)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
