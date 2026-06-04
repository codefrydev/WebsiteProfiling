import { describe, expect, it } from 'vitest';
import { parseJsonField } from './pageGoogleData';

describe('parseJsonField', () => {
  it('returns JSONB objects as-is without stringifying', () => {
    const blob = { gsc_full: { top_queries: [{ query: 'a' }] } };
    expect(parseJsonField(blob)).toEqual(blob);
  });

  it('parses JSON strings', () => {
    expect(parseJsonField('{"x":1}')).toEqual({ x: 1 });
  });

  it('returns null for invalid input', () => {
    expect(parseJsonField(null)).toBeNull();
    expect(parseJsonField(42)).toBeNull();
  });
});
