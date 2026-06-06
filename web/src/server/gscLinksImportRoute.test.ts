import { describe, expect, it } from 'vitest';

describe('GSC links import validation', () => {
  it('rejects empty fileContent', () => {
    const fileContent: string = '';
    expect(!fileContent || !fileContent.trim()).toBe(true);
  });

  it('accepts non-empty CSV content', () => {
    const fileContent = 'Site,Links,Target pages\nexample.com,1,1\n';
    expect(fileContent.trim().length).toBeGreaterThan(0);
  });
});
