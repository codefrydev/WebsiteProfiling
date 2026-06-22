import { describe, it, expect } from 'vitest';
import { evalComputed } from '@/lib/dashboard/engine/computed';

describe('evalComputed — ratio', () => {
  it('computes a scaled ratio', () => {
    expect(
      evalComputed({ kind: 'ratio', numerator: 'a', denominator: 'b', scale: 100 }, { a: 1, b: 4 }),
    ).toBe(25);
  });
  it('divide-by-zero and missing → null (never Infinity/NaN)', () => {
    expect(evalComputed({ kind: 'ratio', numerator: 'a', denominator: 'b' }, { a: 1, b: 0 })).toBeNull();
    expect(evalComputed({ kind: 'ratio', numerator: 'a', denominator: 'b' }, { a: 1 })).toBeNull();
  });
});

describe('evalComputed — arithmetic', () => {
  it('supports + - * / over fields and constants', () => {
    const row = { x: 10, y: 2 };
    expect(evalComputed({ kind: 'arithmetic', op: '+', left: { field: 'x' }, right: { field: 'y' } }, row)).toBe(12);
    expect(evalComputed({ kind: 'arithmetic', op: '-', left: { field: 'x' }, right: { const: 3 } }, row)).toBe(7);
    expect(evalComputed({ kind: 'arithmetic', op: '*', left: { field: 'x' }, right: { field: 'y' } }, row)).toBe(20);
    expect(evalComputed({ kind: 'arithmetic', op: '/', left: { field: 'x' }, right: { field: 'y' } }, row)).toBe(5);
  });
  it('division by zero → null; missing operand → null', () => {
    expect(evalComputed({ kind: 'arithmetic', op: '/', left: { field: 'x' }, right: { const: 0 } }, { x: 1 })).toBeNull();
    expect(evalComputed({ kind: 'arithmetic', op: '+', left: { field: 'x' }, right: { field: 'z' } }, { x: 1 })).toBeNull();
  });
});
