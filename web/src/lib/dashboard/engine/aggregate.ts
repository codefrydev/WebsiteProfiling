/**
 * Streaming aggregators. One accumulator per (category × series × measure),
 * fed row-by-row in a single pass, then finalized.
 *
 * Nulls are SKIPPED (not coerced to 0). `count` counts presence; numeric aggs
 * ignore non-numeric values entirely.
 */
import type { AggOp } from '@/lib/dashboard/engine/types';
import { percentile } from '@/lib/dashboard/engine/coerce';

export interface Acc {
  sum: number;
  /** Count of values that contributed to a numeric aggregate. */
  numN: number;
  /** Count of present (non-null) values — used by `count`. */
  presentN: number;
  min: number;
  max: number;
  set: Set<unknown>;
  vals: number[];
}

export function newAcc(): Acc {
  return {
    sum: 0,
    numN: 0,
    presentN: 0,
    min: Infinity,
    max: -Infinity,
    set: new Set<unknown>(),
    vals: [],
  };
}

/**
 * Feed one value into an accumulator.
 * @param raw  the original (presence) value — drives `count` / `countDistinct`
 * @param num  the coerced numeric value (or null) — drives numeric aggregates
 */
export function step(acc: Acc, raw: unknown, num: number | null): void {
  const present = raw !== null && raw !== undefined && raw !== '';
  if (present) {
    acc.presentN += 1;
    acc.set.add(raw);
  }
  if (num !== null) {
    acc.sum += num;
    acc.numN += 1;
    if (num < acc.min) acc.min = num;
    if (num > acc.max) acc.max = num;
    acc.vals.push(num);
  }
}

/** Merge `src` into `dst` (used to build the Top-N "Other" bucket correctly). */
export function mergeAcc(dst: Acc, src: Acc): void {
  dst.sum += src.sum;
  dst.numN += src.numN;
  dst.presentN += src.presentN;
  if (src.min < dst.min) dst.min = src.min;
  if (src.max > dst.max) dst.max = src.max;
  for (const v of src.set) dst.set.add(v);
  if (src.vals.length) dst.vals.push(...src.vals);
}

export function finalize(acc: Acc, op: AggOp): number | null {
  switch (op) {
    case 'sum':
      return acc.numN ? acc.sum : 0;
    case 'count':
      return acc.presentN;
    case 'countDistinct':
      return acc.set.size;
    case 'avg':
      return acc.numN ? acc.sum / acc.numN : null;
    case 'min':
      return acc.numN ? acc.min : null;
    case 'max':
      return acc.numN ? acc.max : null;
    case 'median':
      return percentile(acc.vals, 0.5);
    default:
      return null;
  }
}
