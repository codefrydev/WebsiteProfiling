import { describe, expect, it } from 'vitest';
import { collectCustomFieldKeys, parseLinkCustomFields } from '@/lib/customFields';
import type { ReportLink } from '@/types';

describe('customFields', () => {
  it('parses JSON custom_fields string', () => {
    const link = { url: 'https://ex.com', custom_fields: '{"price":"9.99","sku":"A1"}' } as ReportLink;
    expect(parseLinkCustomFields(link)).toEqual({ price: '9.99', sku: 'A1' });
  });

  it('collects sorted keys across links', () => {
    const links = [
      { url: 'https://ex.com/a', custom_fields: '{"b":"2","a":"1"}' } as ReportLink,
      { url: 'https://ex.com/b', custom_fields: '{"c":"3"}' } as ReportLink,
    ];
    expect(collectCustomFieldKeys(links)).toEqual(['a', 'b', 'c']);
  });
});
