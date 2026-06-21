import { describe, it, expect } from 'vitest';
import { tableToCsv, sanitize } from '@/lib/dashboard/export/csv';

describe('tableToCsv', () => {
  it('emits a header row + data rows', () => {
    const csv = tableToCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(csv).toBe('a,b\n1,x\n2,y');
  });
  it('quotes values containing commas, quotes, or newlines', () => {
    const csv = tableToCsv([{ a: 'has,comma', b: 'say "hi"' }]);
    expect(csv).toBe('a,b\n"has,comma","say ""hi"""');
  });
  it('returns empty string for no rows', () => {
    expect(tableToCsv([])).toBe('');
  });
});

describe('sanitize', () => {
  it('strips unsafe filename characters', () => {
    expect(sanitize('Top queries / 2024')).toBe('Top_queries_2024');
    expect(sanitize('')).toBe('export');
  });
});
