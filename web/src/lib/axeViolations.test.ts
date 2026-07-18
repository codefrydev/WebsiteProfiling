import { describe, expect, it } from 'vitest';
import {
  filterAxeRowsByRule,
  filterAxeRowsBySearch,
  normalizeAxeImpactForBadge,
  pageHasRule,
  type FlatAxePageRow,
} from './axeViolations';

const sampleRows: FlatAxePageRow[] = [
  {
    id: 'https://a.com',
    url: 'https://a.com',
    title: 'Home',
    violationCount: 2,
    violations: [
      { id: 'color-contrast', impact: 'serious' },
      { id: 'image-alt', impact: 'critical' },
    ],
  },
  {
    id: 'https://b.com',
    url: 'https://b.com',
    title: 'About',
    violationCount: 1,
    violations: [{ id: 'label', impact: 'moderate', description: 'Form label' }],
  },
];

describe('axeViolations helpers', () => {
  it('normalizes axe impact for severity badges', () => {
    expect(normalizeAxeImpactForBadge('serious')).toBe('high');
    expect(normalizeAxeImpactForBadge('critical')).toBe('critical');
    expect(normalizeAxeImpactForBadge('minor')).toBe('low');
  });

  it('filters rows by rule id', () => {
    expect(filterAxeRowsByRule(sampleRows, 'color-contrast')).toHaveLength(1);
    expect(filterAxeRowsByRule(sampleRows, null)).toHaveLength(2);
    expect(pageHasRule(sampleRows[0], 'image-alt')).toBe(true);
  });

  it('filters rows by search query across url and violations', () => {
    expect(filterAxeRowsBySearch(sampleRows, 'about')).toHaveLength(1);
    expect(filterAxeRowsBySearch(sampleRows, 'color-contrast')).toHaveLength(1);
    expect(filterAxeRowsBySearch(sampleRows, '')).toHaveLength(2);
  });
});
