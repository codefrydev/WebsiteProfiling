/**
 * Shared table helpers for Google data views (GSC, GA4).
 */

import type { ExportColumn } from '@/types/components';

export const PAGE_SIZE = 25;

export function paginateSlice<T>(
  items: T[] | null | undefined,
  page: number,
  pageSize = PAGE_SIZE,
): {
  slice: T[];
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
} {
  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    slice: (items || []).slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

export function filterBySearch<T extends Record<string, unknown>>(
  rows: T[],
  search: string,
  field: string,
): T[] {
  const q = (search || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => String(r[field] || '').toLowerCase().includes(q));
}

export function truncateLabel(text: unknown, max = 42): string {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function exportCsv(
  rows: Array<Record<string, unknown>>,
  columns: ExportColumn[],
  filename = 'export.csv',
): void {
  if (!rows?.length) return;
  const keys = columns.map((c) => c.key);
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((r) => keys.map((k) => escape(r[k])).join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
