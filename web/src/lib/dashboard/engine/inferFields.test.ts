import { describe, it, expect } from 'vitest';
import { inferFields, mergeFields } from '@/lib/dashboard/engine/inferFields';
import type { FieldDef } from '@/lib/dashboard/engine/types';

describe('inferFields', () => {
  it('classifies all-numeric as measure, mixed/string as dimension', () => {
    const fields = inferFields([
      { name: 'a', value: 10, mixed: 1 },
      { name: 'b', value: 20, mixed: 'x' },
    ]);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.value.role).toBe('measure');
    expect(byKey.name.role).toBe('dimension');
    expect(byKey.mixed.role).toBe('dimension'); // had a string → dimension
  });

  it('detects date dimensions', () => {
    const fields = inferFields([{ d: '2024-01-01' }, { d: '2024-02-01' }]);
    expect(fields[0]).toMatchObject({ key: 'd', role: 'dimension', isDate: true });
  });

  it('omits object-only fields (not chartable) and handles empty input', () => {
    expect(inferFields([])).toEqual([]);
    const f = inferFields([{ nested: { a: 1 }, n: 5 }]);
    expect(f.find((x) => x.key === 'nested')).toBeUndefined(); // object-only → dropped
    expect(f.find((x) => x.key === 'n')?.role).toBe('measure');
  });
});

describe('mergeFields', () => {
  it('curated wins on collision; inferred fills gaps; curated first', () => {
    const curated: FieldDef[] = [{ key: 'score', label: 'Score', role: 'measure', defaultAgg: 'avg' }];
    const inferred: FieldDef[] = [
      { key: 'score', label: 'score', role: 'dimension', inferred: true },
      { key: 'extra', label: 'Extra', role: 'measure', inferred: true },
    ];
    const merged = mergeFields(curated, inferred);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(curated[0]); // curated kept verbatim
    expect(merged[1].key).toBe('extra');
  });
});
