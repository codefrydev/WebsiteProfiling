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
    expect(portfolioDeltaClassName(3)).toContain('green');
    expect(portfolioDeltaClassName(-12)).toContain('red');
    expect(portfolioDeltaClassName(-3)).toContain('amber');
  });

  it('colors median scores by band', () => {
    expect(portfolioMedianClassName(85)).toContain('green');
    expect(portfolioMedianClassName(55)).toContain('yellow');
    expect(portfolioMedianClassName(40)).toContain('red');
  });
});
