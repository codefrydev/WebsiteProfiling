import { describe, expect, it } from 'vitest';
import { parseUrlTab } from '@/hooks/useUrlTab';

const TABS = ['summary', 'charts', 'health', 'pages'] as const;

describe('parseUrlTab', () => {
  it('returns valid tab from raw value', () => {
    expect(parseUrlTab('charts', TABS, 'summary')).toBe('charts');
  });

  it('returns default when raw is null', () => {
    expect(parseUrlTab(null, TABS, 'summary')).toBe('summary');
  });

  it('returns default when raw is invalid', () => {
    expect(parseUrlTab('invalid', TABS, 'summary')).toBe('summary');
  });

  it('returns default tab when raw matches default', () => {
    expect(parseUrlTab('summary', TABS, 'summary')).toBe('summary');
  });
});
