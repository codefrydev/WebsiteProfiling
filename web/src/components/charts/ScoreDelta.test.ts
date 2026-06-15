import { describe, expect, it } from 'vitest';
import { isImprovedScoreDelta, isNeutralScoreDelta } from './ScoreDelta';

describe('ScoreDelta helpers', () => {
  it('treats null, zero, and non-finite deltas as neutral', () => {
    expect(isNeutralScoreDelta(null)).toBe(true);
    expect(isNeutralScoreDelta(undefined)).toBe(true);
    expect(isNeutralScoreDelta(0)).toBe(true);
    expect(isNeutralScoreDelta(NaN)).toBe(true);
    expect(isNeutralScoreDelta(Infinity)).toBe(true);
    expect(isNeutralScoreDelta(-Infinity)).toBe(true);
    expect(isNeutralScoreDelta(5)).toBe(false);
  });

  it('scores improvement when higher is better', () => {
    expect(isImprovedScoreDelta(3, true)).toBe(true);
    expect(isImprovedScoreDelta(-2, true)).toBe(false);
  });

  it('inverts improvement when lower is better', () => {
    expect(isImprovedScoreDelta(3, false)).toBe(false);
    expect(isImprovedScoreDelta(-2, false)).toBe(true);
  });
});
