import { describe, expect, it } from 'vitest';
import { normalizePriority } from './issuePriority';

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
});
