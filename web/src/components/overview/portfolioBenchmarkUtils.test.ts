import { describe, expect, it } from 'vitest';
import {
  portfolioDeltaClassName,
  portfolioDeltaNarrative,
  portfolioMedianClassName,
} from './portfolioBenchmarkUtils';

describe('portfolioBenchmarkUtils', () => {
  it('narrates ahead, behind, and even deltas', () => {
    expect(portfolioDeltaNarrative(5)).toContain('5');
    expect(portfolioDeltaNarrative(-8)).toContain('8');
    expect(portfolioDeltaNarrative(0)).toBeTruthy();
  });

  it('colors deltas semantically', () => {
    expect(portfolioDeltaClassName(3)).toContain('md-sys-success');
    expect(portfolioDeltaClassName(-12)).toContain('md-sys-error');
    expect(portfolioDeltaClassName(-3)).toContain('md-sys-warning');
  });

  it('colors median scores by band', () => {
    expect(portfolioMedianClassName(85)).toContain('md-sys-success');
    expect(portfolioMedianClassName(55)).toContain('md-sys-warning');
    expect(portfolioMedianClassName(40)).toContain('md-sys-error');
  });
});
