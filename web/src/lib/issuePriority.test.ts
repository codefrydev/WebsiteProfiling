import { describe, expect, it } from 'vitest';
import {
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  getPriorityChartColor,
  normalizePriority,
} from './issuePriority';

describe('normalizePriority', () => {
  it('normalizes mixed-case strings to canonical PriorityKey', () => {
    expect(normalizePriority('high')).toBe('High');
    expect(normalizePriority('HIGH')).toBe('High');
    expect(normalizePriority('critical')).toBe('Critical');
    expect(normalizePriority('MEDIUM')).toBe('Medium');
    expect(normalizePriority('low')).toBe('Low');
  });

  it('defaults unknown or empty values to Medium', () => {
    expect(normalizePriority(undefined)).toBe('Medium');
    expect(normalizePriority(null)).toBe('Medium');
    expect(normalizePriority('')).toBe('Medium');
    expect(normalizePriority('urgent')).toBe('Medium');
  });

  it('provides valid concrete hex colors in PRIORITY_CONFIG for canvas rendering', () => {
    for (const p of PRIORITY_ORDER) {
      expect(PRIORITY_CONFIG[p].chartColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('returns theme-aware stroke and fill colors from getPriorityChartColor', () => {
    const darkColors = getPriorityChartColor('Critical', true);
    expect(darkColors.stroke).toBe('#F87171');
    expect(darkColors.fill).toContain('rgba');

    const lightColors = getPriorityChartColor('Critical', false);
    expect(lightColors.stroke).toBe('#EF4444');
    expect(lightColors.fill).toContain('rgba');
  });
});
