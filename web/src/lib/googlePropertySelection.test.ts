import { describe, expect, it } from 'vitest';
import { pickInitialPropertyId, propertyIdsEqual } from './googlePropertySelection';
import type { PropertyPickCandidate } from './googlePropertySelection';

function row(
  id: number | string,
  canonical_domain: string,
  site_url: string | null = null,
): PropertyPickCandidate {
  return {
    id,
    canonical_domain,
    site_url,
  };
}

describe('propertyIdsEqual', () => {
  it('matches string and numeric ids', () => {
    expect(propertyIdsEqual('1', 1)).toBe(true);
    expect(propertyIdsEqual(1, '1')).toBe(true);
    expect(propertyIdsEqual('1', 2)).toBe(false);
  });
});

describe('pickInitialPropertyId', () => {
  const properties = [
    row(1, 'codefrydev.in', 'https://codefrydev.in'),
    row(2, 'example.com'),
  ];

  it('falls back to first property when explicitId is stale', () => {
    expect(
      pickInitialPropertyId(properties, {
        explicitId: 99999,
      }),
    ).toBe(1);
  });

  it('matches explicitId when property id is a string from JSON', () => {
    const stringIds = [row('1', 'codefrydev.in'), row('2', 'example.com')];
    expect(
      pickInitialPropertyId(stringIds, {
        explicitId: 1,
      }),
    ).toBe(1);
  });

  it('matches by startUrl when explicitId is invalid', () => {
    expect(
      pickInitialPropertyId(properties, {
        explicitId: 99999,
        startUrl: 'https://example.com',
      }),
    ).toBe(2);
  });

  it('uses activePropertyId when explicitId is invalid', () => {
    expect(
      pickInitialPropertyId(properties, {
        explicitId: 99999,
        activePropertyId: '2',
      }),
    ).toBe(2);
  });

  it('returns null for empty list', () => {
    expect(pickInitialPropertyId([], { explicitId: 1 })).toBeNull();
  });
});
