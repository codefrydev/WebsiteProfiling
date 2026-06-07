import { describe, expect, it } from 'vitest';
import { buildInitialPipelineConfigState } from '@/lib/pipelineConfigSchema';
import { buildPipelineRunPreview } from '@/lib/pipelineRunPreview';

describe('buildPipelineRunPreview', () => {
  it('includes crawl and report for full audit', () => {
    const preview = buildPipelineRunPreview({
      presetId: 'full-audit',
      configState: buildInitialPipelineConfigState(),
    });
    expect(preview.maxCrawlPages).toBe(500);
    expect(preview.phases.some((p) => p.id === 'crawl')).toBe(true);
    expect(preview.phases.some((p) => p.id === 'report')).toBe(true);
    expect(preview.timeMaxSeconds).toBeGreaterThan(preview.timeMinSeconds);
  });

  it('limits phases for crawl-only preset', () => {
    const preview = buildPipelineRunPreview({
      presetId: 'crawl-only',
      configState: buildInitialPipelineConfigState(),
    });
    expect(preview.phases.map((p) => p.id)).toEqual(['crawl']);
    expect(preview.phases.some((p) => p.id === 'report')).toBe(false);
  });

  it('reflects crawl preset max pages', () => {
    const preview = buildPipelineRunPreview({
      presetId: 'full-audit',
      configState: { ...buildInitialPipelineConfigState(), max_pages: '2000' },
      crawlPresetId: 'spa',
    });
    expect(preview.maxCrawlPages).toBe(2000);
    expect(preview.configRows.some((r) => r.label === 'Crawl preset' && r.value === 'SPA / JavaScript')).toBe(
      true,
    );
  });
});
