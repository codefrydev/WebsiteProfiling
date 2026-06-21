import { describe, it, expect } from 'vitest';
import { newAcc, step, mergeAcc, finalize } from '@/lib/dashboard/engine/aggregate';
import { toNumber } from '@/lib/dashboard/engine/coerce';

function feed(values: unknown[]) {
  const acc = newAcc();
  for (const v of values) step(acc, v, toNumber(v));
  return acc;
}

describe('aggregate finalize', () => {
  it('sum / avg / min / max / median over numbers', () => {
    const acc = feed([1, 2, 3, 4]);
    expect(finalize(acc, 'sum')).toBe(10);
    expect(finalize(acc, 'avg')).toBe(2.5);
    expect(finalize(acc, 'min')).toBe(1);
    expect(finalize(acc, 'max')).toBe(4);
    expect(finalize(acc, 'median')).toBe(2.5);
  });

  it('count counts presence, countDistinct counts unique', () => {
    const acc = feed(['a', 'a', 'b', '', null]);
    expect(finalize(acc, 'count')).toBe(3); // '' and null are absent
    expect(finalize(acc, 'countDistinct')).toBe(2);
  });

  it('skips nulls in numeric aggregates (not coerced to 0)', () => {
    const acc = feed([10, null, 'x', 20]); // 'x' -> null, null -> null
    expect(finalize(acc, 'avg')).toBe(15); // (10+20)/2, not /4
    expect(finalize(acc, 'sum')).toBe(30);
    expect(finalize(acc, 'min')).toBe(10);
  });

  it('empty group: sum/count → 0, avg/min/max/median → null', () => {
    const acc = newAcc();
    expect(finalize(acc, 'sum')).toBe(0);
    expect(finalize(acc, 'count')).toBe(0);
    expect(finalize(acc, 'countDistinct')).toBe(0);
    expect(finalize(acc, 'avg')).toBeNull();
    expect(finalize(acc, 'min')).toBeNull();
    expect(finalize(acc, 'max')).toBeNull();
    expect(finalize(acc, 'median')).toBeNull();
  });

  it('mergeAcc produces a correct combined avg/median (for Top-N Other)', () => {
    const a = feed([1, 2, 3]);
    const b = feed([4, 5, 6, 7]);
    mergeAcc(a, b);
    expect(finalize(a, 'sum')).toBe(28);
    expect(finalize(a, 'avg')).toBe(4); // 28 / 7 — true mean, not mean of means
    expect(finalize(a, 'median')).toBe(4);
    expect(finalize(a, 'max')).toBe(7);
    expect(finalize(a, 'min')).toBe(1);
  });
});
