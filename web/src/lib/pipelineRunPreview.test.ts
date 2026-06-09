import { describe, expect, it } from 'vitest';
import { buildInitialPipelineConfigState } from '@/lib/pipelineConfigSchema';
import { buildPipelineRunPreview, formatPipelineRunDuration } from '@/lib/pipelineRunPreview';
import { applyCrawlPreset } from '@/lib/crawlPresets';

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

  it('applies crawl preset patch when computing preview', () => {
    const preview = buildPipelineRunPreview({
      presetId: 'full-audit',
      configState: buildInitialPipelineConfigState(),
      crawlPresetId: 'spa',
    });
    const patched = applyCrawlPreset('spa', buildInitialPipelineConfigState());
    expect(preview.maxCrawlPages).toBe(Number(patched.max_pages));
    expect(preview.configRows.some((r) => r.label === 'Crawl preset' && r.value === 'SPA / JavaScript')).toBe(
      true,
    );
  });

  it('does not assume every page in the crawl limit will be fetched', () => {
    const performance = applyCrawlPreset('performance', buildInitialPipelineConfigState());
    const preview = buildPipelineRunPreview({
      presetId: 'full-audit',
      configState: performance,
      crawlPresetId: 'performance',
    });
    expect(formatPipelineRunDuration(preview.timeMinSeconds, preview.timeMaxSeconds)).not.toBe(
      '12 min – 21 min',
    );
    expect(preview.timeMinSeconds).toBeLessThan(8 * 60);
    expect(preview.timeMaxSeconds).toBeLessThan(22 * 60);
  });

  it('stays short for small crawl limits', () => {
    const preview = buildPipelineRunPreview({
      presetId: 'full-audit',
      configState: {
        ...buildInitialPipelineConfigState(),
        max_pages: '30',
        lighthouse_max_pages: '2',
      },
    });
    expect(preview.timeMaxSeconds).toBeLessThan(6 * 60);
  });
});
