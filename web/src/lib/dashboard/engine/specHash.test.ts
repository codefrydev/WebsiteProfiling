import { describe, it, expect } from 'vitest';
import { stableStringify } from '@/lib/dashboard/engine/specHash';

describe('stableStringify', () => {
  it('is invariant to key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(stableStringify({ x: { p: 1, q: 2 } })).toBe(stableStringify({ x: { q: 2, p: 1 } }));
  });
  it('distinguishes different values', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
  it('preserves array order', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });
});
