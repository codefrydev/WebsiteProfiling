import { describe, expect, it } from 'vitest';
import {
  clampSlideIndex,
  nextSlideIndex,
  prevSlideIndex,
  resolveSlideId,
} from '@/hooks/useLandingDeck';

const SECTION_IDS = ['hero', 'stats', 'features'] as const;

describe('useLandingDeck helpers', () => {
  it('clampSlideIndex bounds index to valid range', () => {
    expect(clampSlideIndex(-1, 3)).toBe(0);
    expect(clampSlideIndex(1, 3)).toBe(1);
    expect(clampSlideIndex(9, 3)).toBe(2);
    expect(clampSlideIndex(0, 0)).toBe(0);
  });

  it('resolveSlideId maps index and id targets', () => {
    expect(resolveSlideId(SECTION_IDS, 1)).toBe('stats');
    expect(resolveSlideId(SECTION_IDS, 'features')).toBe('features');
    expect(resolveSlideId(SECTION_IDS, 'missing')).toBeNull();
    expect(resolveSlideId([], 0)).toBeNull();
  });

  it('nextSlideIndex and prevSlideIndex step within deck bounds', () => {
    expect(nextSlideIndex(0, 3)).toBe(1);
    expect(nextSlideIndex(2, 3)).toBe(2);
    expect(prevSlideIndex(2, 3)).toBe(1);
    expect(prevSlideIndex(0, 3)).toBe(0);
  });
});
