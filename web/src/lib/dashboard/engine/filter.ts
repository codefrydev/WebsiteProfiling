/**
 * Row filtering. The single injection point for widget filters, board slicers,
 * cross-filters, and drill — all expressed as `Filter[]`.
 */
import type { Filter } from '@/lib/dashboard/engine/types';
import { dotGet, toNumber } from '@/lib/dashboard/engine/coerce';

/** Loose equality: numeric when either side is numeric, else string compare. */
function eqLoose(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const an = toNumber(a);
  const bn = toNumber(b);
  if (an !== null && bn !== null) return an === bn;
  return String(a ?? '') === String(b ?? '');
}

function toComparable(v: unknown, asDate?: boolean): number | null {
  if (asDate) {
    const t = Date.parse(String(v ?? ''));
    return Number.isFinite(t) ? t : null;
  }
  return toNumber(v);
}

function matchOne(raw: unknown, f: Filter): boolean {
  switch (f.op) {
    case 'eq':
      return eqLoose(raw, f.value as unknown);
    case 'neq':
      return !eqLoose(raw, f.value as unknown);
    case 'in':
      return Array.isArray(f.value) && (f.value as unknown[]).some((v) => eqLoose(raw, v));
    case 'nin':
      return !(Array.isArray(f.value) && (f.value as unknown[]).some((v) => eqLoose(raw, v)));
    case 'contains':
      return String(raw ?? '')
        .toLowerCase()
        .includes(String(f.value ?? '').toLowerCase());
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toComparable(raw, f.asDate);
      const b = toComparable(f.value, f.asDate);
      if (a === null || b === null) return false;
      if (f.op === 'gt') return a > b;
      if (f.op === 'gte') return a >= b;
      if (f.op === 'lt') return a < b;
      return a <= b;
    }
    case 'between': {
      const a = toComparable(raw, f.asDate);
      if (a === null || !Array.isArray(f.value) || f.value.length !== 2) return false;
      const lo = toComparable(f.value[0], f.asDate);
      const hi = toComparable(f.value[1], f.asDate);
      if (lo === null || hi === null) return false;
      const min = Math.min(lo, hi);
      const max = Math.max(lo, hi);
      return a >= min && a <= max;
    }
    default:
      return true;
  }
}

/** True when a filter actually constrains anything (empty values are no-ops). */
export function hasFilterValue(f: Filter): boolean {
  const v = f.value;
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim() !== '';
  return true; // numbers, booleans
}

export function applyFilters(
  rows: Record<string, unknown>[],
  filters?: Filter[],
): Record<string, unknown>[] {
  const active = (filters ?? []).filter(hasFilterValue);
  if (!active.length) return rows;
  return rows.filter((row) => active.every((f) => matchOne(dotGet(row, f.field), f)));
}
