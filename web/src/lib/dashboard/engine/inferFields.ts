/**
 * Auto-infer fields from row data so every dataset has a usable field list even
 * where not curated. Curated fields always win on key collision.
 */
import type { FieldDef, FieldRole } from '@/lib/dashboard/engine/types';
import { humanize } from '@/lib/dashboard/engine/coerce';

const SAMPLE_N = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

export function inferFields(rows: Record<string, unknown>[]): FieldDef[] {
  if (!rows.length) return [];
  const sample = rows.slice(0, SAMPLE_N);
  const keys = new Set<string>();
  for (const r of sample) for (const k of Object.keys(r)) keys.add(k);

  const out: FieldDef[] = [];
  for (const key of keys) {
    let sawNumber = false;
    let sawNonNumber = false;
    let sawDate = false;
    let present = 0;
    for (const r of sample) {
      const v = r[key];
      if (v == null || v === '') continue;
      // Skip nested objects/arrays — not directly chartable as a field.
      if (typeof v === 'object') { sawNonNumber = true; continue; }
      present += 1;
      if (typeof v === 'number' && Number.isFinite(v)) sawNumber = true;
      else {
        sawNonNumber = true;
        if (typeof v === 'string' && DATE_RE.test(v)) sawDate = true;
      }
    }
    if (!present) continue;
    const role: FieldRole = sawNumber && !sawNonNumber ? 'measure' : 'dimension';
    out.push({
      key,
      label: humanize(key),
      role,
      defaultAgg: role === 'measure' ? 'sum' : undefined,
      isDate: role === 'dimension' && sawDate ? true : undefined,
      inferred: true,
    });
  }
  return out;
}

/** Merge curated fields over inferred; curated wins, inferred fills gaps. Curated order first. */
export function mergeFields(curated: FieldDef[], inferred: FieldDef[]): FieldDef[] {
  const seen = new Set(curated.map((f) => f.key));
  return [...curated, ...inferred.filter((f) => !seen.has(f.key))];
}
