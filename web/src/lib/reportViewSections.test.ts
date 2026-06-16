import { describe, expect, it } from 'vitest';
import { sectionFieldsPresent } from '@/lib/reportSections';
import { shouldBlockViewForSections } from '@/lib/reportViewSections';
import type { ReportPayload } from '@/types';

describe('sectionFieldsPresent', () => {
  it('returns false when data is missing', () => {
    expect(sectionFieldsPresent('links', null)).toBe(false);
  });

  it('returns true when a section field exists on the payload', () => {
    expect(sectionFieldsPresent('links', { links: [] } as ReportPayload)).toBe(true);
  });

  it('returns false when section fields are absent', () => {
    expect(sectionFieldsPresent('links', { site_name: 'x' } as ReportPayload)).toBe(false);
  });
});

describe('shouldBlockViewForSections', () => {
  it('does not block when every section is loaded', () => {
    expect(
      shouldBlockViewForSections(['links'], { links: 'loaded' }, { links: [] } as ReportPayload),
    ).toBe(false);
  });

  it('does not block when cached section data is already merged', () => {
    expect(
      shouldBlockViewForSections(['links'], { links: 'loading' }, { links: [{ url: 'https://a.test/' }] } as ReportPayload),
    ).toBe(false);
  });

  it('blocks when a section is pending and data is missing', () => {
    expect(shouldBlockViewForSections(['links'], { links: 'idle' }, null)).toBe(true);
    expect(shouldBlockViewForSections(['links'], { links: 'loading' }, { site_name: 'x' } as ReportPayload)).toBe(true);
  });

  it('blocks when any required section in a group is pending without data', () => {
    expect(
      shouldBlockViewForSections(
        ['structure', 'links'],
        { structure: 'loaded', links: 'idle' },
        { graph_nodes: [] } as ReportPayload,
      ),
    ).toBe(true);
  });
});
