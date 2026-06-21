import { describe, it, expect } from 'vitest';
import { buildScoreArcPaths } from './arcGauge';

describe('buildScoreArcPaths', () => {
  it('returns background arc always', () => {
    const { background, foreground } = buildScoreArcPaths(null, 13, 16);
    expect(background).toMatch(/^M/);
    expect(foreground).toBeNull();
  });

  it('returns foreground arc for valid score', () => {
    const { foreground } = buildScoreArcPaths(75, 13, 16);
    expect(foreground).toMatch(/^M/);
  });

  it('clamps score to 0–100', () => {
    const over = buildScoreArcPaths(150, 13, 16);
    const under = buildScoreArcPaths(-10, 13, 16);
    expect(over.foreground).toBeTruthy();
    expect(under.foreground).toBeTruthy();
  });
});
