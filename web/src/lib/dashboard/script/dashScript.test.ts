import { describe, expect, it } from 'vitest';
import { evalMeasure, evalTransform } from '@/lib/dashboard/script/eval';
import { DashScriptError } from '@/lib/dashboard/script/types';

const ctx = {
  raw: { health_score: 82, performance: 91, grade: 'B' },
  rows: [
    { category: 'SEO', score: 90, count: 12 },
    { category: 'Perf', score: 70, count: 5 },
    { category: 'Security', score: 85, count: 3 },
  ],
};

describe('DashScript measures', () => {
  it('reads field() from raw result', () => {
    expect(evalMeasure('field("health_score")', ctx)).toBe(82);
  });

  it('supports dot-path field access', () => {
    expect(evalMeasure('field("performance")', ctx)).toBe(91);
  });

  it('aggregates sum across rows', () => {
    expect(evalMeasure('sum("count")', ctx)).toBe(20);
  });

  it('aggregates avg across rows', () => {
    expect(evalMeasure('avg("score")', ctx)).toBe(81.66666666666667);
  });

  it('evaluates if() with comparison', () => {
    expect(evalMeasure('if(field("health_score") >= 80, "Good", "Poor")', ctx)).toBe('Good');
  });

  it('supports arithmetic', () => {
    expect(evalMeasure('field("health_score") * 100 / 100', ctx)).toBe(82);
  });

  it('coalesce returns first non-null', () => {
    expect(evalMeasure('coalesce(field("missing"), field("health_score"))', ctx)).toBe(82);
  });

  it('division by zero returns null instead of 0', () => {
    expect(evalMeasure('field("health_score") / 0', ctx)).toBeNull();
  });
});

describe('DashScript transforms', () => {
  it('filters rows by predicate', () => {
    const out = evalTransform('filter(count > 10)', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('SEO');
  });

  it('sorts and takes top N', () => {
    const out = evalTransform('sort(score, desc) | take(2)', ctx);
    expect(out.map((r) => r.category)).toEqual(['SEO', 'Security']);
  });

  it('projects selected columns', () => {
    const out = evalTransform('project(category, score)', ctx);
    expect(Object.keys(out[0]).sort()).toEqual(['category', 'score']);
  });

  it('filters by string equality', () => {
    const rows = [
      { severity: 'critical', count: 1 },
      { severity: 'warning', count: 2 },
    ];
    const out = evalTransform('filter(severity == "critical")', { raw: {}, rows });
    expect(out).toHaveLength(1);
  });
});

describe('DashScript errors', () => {
  it('throws on unknown function', () => {
    expect(() => evalMeasure('unknown()', ctx)).toThrow(DashScriptError);
  });

  it('throws on bad syntax', () => {
    expect(() => evalMeasure('field(', ctx)).toThrow(DashScriptError);
  });
});
