/**
 * The query engine: a single pure function turning dataset rows + a QuerySpec
 * into a normalized QueryResult that feeds charts, tables, and KPIs alike.
 *
 * Pipeline: filter → (detail | KPI | grouped) → aggregate → sort → topN(+Other).
 */
import type {
  QuerySpec,
  QueryResult,
  QueryResultSeries,
  MeasureSpec,
  AggOp,
} from '@/lib/dashboard/engine/types';
import { dotGet, toNumber } from '@/lib/dashboard/engine/coerce';
import { applyFilters } from '@/lib/dashboard/engine/filter';
import { evalComputed } from '@/lib/dashboard/engine/computed';
import { newAcc, step, mergeAcc, finalize, type Acc } from '@/lib/dashboard/engine/aggregate';

const SINGLE = '__single__';

export function measureLabel(m: MeasureSpec): string {
  return m.label ?? `${m.agg}(${m.field})`;
}

/** Per-row value a measure contributes (computed field, count presence, or numeric). */
function rowValue(row: Record<string, unknown>, m: MeasureSpec): { raw: unknown; num: number | null } {
  if (m.computed) {
    const v = evalComputed(m.computed, row);
    return { raw: v, num: v };
  }
  const raw = dotGet(row, m.field);
  return { raw, num: toNumber(raw) };
}

/** True when every category key parses as a finite number. */
function allNumeric(keys: string[]): boolean {
  return keys.length > 0 && keys.every((k) => k !== '' && Number.isFinite(Number(k)));
}

function compareKeys(a: string, b: string, numeric: boolean): number {
  if (numeric) return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function runQuery(rows: Record<string, unknown>[], spec: QuerySpec): QueryResult {
  const filtered = applyFilters(rows, spec.filters);

  // Normalize: a grouped query with no measures gets an implicit count.
  let measures = spec.measures ?? [];
  if (spec.groupBy && measures.length === 0) {
    measures = [{ field: spec.groupBy, agg: 'count', label: 'Count' }];
  }

  // ── Detail-table mode: no groupBy, no measures → raw rows projected to columns.
  if (!spec.groupBy && measures.length === 0) {
    const cols = spec.columns;
    const table = cols && cols.length
      ? filtered.map((r) => {
          const out: Record<string, unknown> = {};
          for (const c of cols) out[c] = dotGet(r, c);
          return out;
        })
      : filtered;
    return { categories: [], series: [], table, scalar: filtered.length };
  }

  // ── Ungrouped KPI: measures over the whole (filtered) set.
  if (!spec.groupBy) {
    const raw = measures.map((m) => {
      const acc = newAcc();
      for (const row of filtered) {
        const rv = rowValue(row, m);
        step(acc, rv.raw, rv.num);
      }
      return { key: m.field || 'value', label: measureLabel(m), value: finalize(acc, m.agg) };
    });
    const tableRow: Record<string, unknown> = {};
    for (const s of raw) tableRow[s.label] = s.value;
    return {
      categories: [''],
      series: raw.map((s) => ({ key: s.key, label: s.label, values: [normNum(s.value)] })),
      table: [tableRow],
      scalar: numOrNull(raw[0]?.value),
    };
  }

  // ── Grouped.
  const seriesSplit = !!spec.series;
  const catOrder: string[] = [];
  const catSeen = new Set<string>();
  const seriesOrder: string[] = [];
  const seriesSeen = new Set<string>();
  // cat -> seriesKey -> Acc[] (one per measure)
  const accs = new Map<string, Map<string, Acc[]>>();

  const newMeasureAccs = () => measures.map(() => newAcc());

  for (const row of filtered) {
    const catKey = String(dotGet(row, spec.groupBy) ?? '');
    if (!catSeen.has(catKey)) { catSeen.add(catKey); catOrder.push(catKey); }
    const sKey = seriesSplit ? String(dotGet(row, spec.series as string) ?? '') : SINGLE;
    if (seriesSplit && !seriesSeen.has(sKey)) { seriesSeen.add(sKey); seriesOrder.push(sKey); }

    let bySeries = accs.get(catKey);
    if (!bySeries) { bySeries = new Map(); accs.set(catKey, bySeries); }
    let mAccs = bySeries.get(sKey);
    if (!mAccs) { mAccs = newMeasureAccs(); bySeries.set(sKey, mAccs); }

    for (let mi = 0; mi < measures.length; mi++) {
      const { raw, num } = rowValue(row, measures[mi]);
      step(mAccs[mi], raw, num);
    }
  }

  const seriesKeys = seriesSplit ? seriesOrder : [SINGLE];
  const accFor = (cat: string, sKey: string, mi: number): Acc | undefined =>
    accs.get(cat)?.get(sKey)?.[mi];
  const valueFor = (cat: string, sKey: string, mi: number): number | null => {
    const a = accFor(cat, sKey, mi);
    return a ? finalize(a, measures[mi].agg) : null;
  };

  // ── Sort categories.
  let ordered = [...catOrder];
  const sort = spec.sort;
  if (sort) {
    const numericKeys = allNumeric(catOrder);
    const idx = new Map(catOrder.map((c, i) => [c, i]));
    if (sort.by === 'category') {
      ordered.sort((a, b) => {
        const c = compareKeys(a, b, numericKeys);
        return (sort.dir === 'desc' ? -c : c) || (idx.get(a)! - idx.get(b)!);
      });
    } else {
      const mi = Math.max(0, measures.findIndex((m) => measureLabel(m) === sort.by));
      const sortVal = (cat: string) =>
        seriesKeys.reduce((acc, sk) => acc + (valueFor(cat, sk, mi) ?? 0), 0);
      ordered.sort((a, b) => {
        const d = sortVal(a) - sortVal(b);
        return (sort.dir === 'desc' ? -d : d) || (idx.get(a)! - idx.get(b)!);
      });
    }
  }

  // ── Top-N (+ Other bucket built by merging retained accumulators).
  let otherCats: string[] = [];
  if (spec.topN && spec.topN.n > 0 && ordered.length > spec.topN.n) {
    otherCats = ordered.slice(spec.topN.n);
    ordered = ordered.slice(0, spec.topN.n);
  }
  const otherLabel = spec.topN?.otherLabel ?? 'Other';
  const includeOther = !!spec.topN?.other && otherCats.length > 0;

  // Merged Other accs: seriesKey -> Acc[]
  const otherAccs = new Map<string, Acc[]>();
  if (includeOther) {
    for (const sk of seriesKeys) {
      const merged = measures.map(() => newAcc());
      for (const cat of otherCats) {
        for (let mi = 0; mi < measures.length; mi++) {
          const a = accFor(cat, sk, mi);
          if (a) mergeAcc(merged[mi], a);
        }
      }
      otherAccs.set(sk, merged);
    }
  }

  const finalCats = includeOther ? [...ordered, otherLabel] : ordered;
  const valueAt = (cat: string, sKey: string, mi: number): number | null => {
    if (includeOther && cat === otherLabel) {
      const a = otherAccs.get(sKey)?.[mi];
      return a ? finalize(a, measures[mi].agg) : null;
    }
    return valueFor(cat, sKey, mi);
  };

  // ── Emit series.
  let series: QueryResultSeries[];
  if (seriesSplit) {
    // One series per series value; values = primary measure (measure[0]) across categories.
    series = seriesKeys.map((sk) => ({
      key: sk,
      label: sk === '' ? '(none)' : sk,
      values: finalCats.map((c) => normNum(valueAt(c, sk, 0))),
    }));
  } else {
    series = measures.map((m, mi) => ({
      key: m.field || `m${mi}`,
      label: measureLabel(m),
      values: finalCats.map((c) => normNum(valueAt(c, SINGLE, mi))),
    }));
  }

  // ── Emit table (one row per category).
  const catCol = spec.groupBy;
  const table = finalCats.map((c, ci) => {
    const row: Record<string, unknown> = { [catCol]: c === '' ? '(none)' : c };
    for (const s of series) row[s.label] = s.values[ci];
    return row;
  });

  return {
    categories: finalCats.map((c) => (c === '' ? '(none)' : c)),
    series,
    table,
    scalar: numOrNull(series[0]?.values[0]),
  };
}

/** null → 0 for chart value arrays (charts expect numbers; gaps render as 0). */
function normNum(v: number | null): number {
  return v == null || !Number.isFinite(v) ? 0 : v;
}

/** Preserve null for the KPI scalar (so "no data" shows an em-dash, not 0). */
function numOrNull(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : v;
}
