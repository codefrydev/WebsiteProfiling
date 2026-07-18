import type { PipelineConfigState } from '@/types/api';

/** Property-level crawl presets (stored in properties.default_crawl_preset). */
export type CrawlPresetId = 'starter' | 'spa' | 'ecommerce' | 'performance';

export interface CrawlPresetDefinition {
  id: CrawlPresetId;
  label: string;
  description: string;
  configPatch: Partial<PipelineConfigState>;
}

export const CRAWL_PRESETS: CrawlPresetDefinition[] = [
  {
    id: 'starter',
    label: 'Starter',
    description: 'Fast static crawl for small sites (up to 500 URLs). Tech detection is limited on JavaScript-heavy sites.',
    configPatch: {
      max_pages: '500',
      crawl_render_mode: 'static',
      crawl_stream_to_db: false,
      run_lighthouse_on_pages: true,
      lighthouse_max_pages: '5',
    },
  },
  {
    id: 'spa',
    label: 'SPA / JavaScript',
    description: 'Auto JS rendering for React, Vue, Next.js themes (up to 2,000 URLs).',
    configPatch: {
      max_pages: '2000',
      crawl_render_mode: 'auto',
      crawl_js_concurrency: '3',
      crawl_stream_to_db: true,
      run_lighthouse_on_pages: true,
      lighthouse_max_pages: '10',
    },
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    description: 'Large catalog crawl with streaming writes (up to 10,000 URLs).',
    configPatch: {
      max_pages: '10000',
      crawl_render_mode: 'auto',
      crawl_stream_to_db: true,
      concurrency: '12',
      run_lighthouse_on_pages: false,
      lighthouse_max_pages: '0',
    },
  },
  {
    id: 'performance',
    label: 'Performance focus',
    description: 'Moderate crawl plus Lighthouse on top traffic pages when GSC is connected.',
    configPatch: {
      max_pages: '1000',
      crawl_render_mode: 'static',
      run_lighthouse: true,
      run_lighthouse_on_pages: true,
      lighthouse_max_pages: '25',
      lighthouse_strategy: 'mobile',
      lighthouse_categories: 'performance,accessibility,best-practices,seo',
    },
  },
];

export const DEFAULT_CRAWL_PRESET_ID: CrawlPresetId = 'starter';

export function isCrawlPresetId(id: string): id is CrawlPresetId {
  return CRAWL_PRESETS.some((p) => p.id === id);
}

export function getCrawlPresetById(id: string): CrawlPresetDefinition {
  return CRAWL_PRESETS.find((p) => p.id === id) ?? CRAWL_PRESETS[0];
}

export function applyCrawlPreset(
  presetId: string,
  configState: PipelineConfigState,
): PipelineConfigState {
  const preset = getCrawlPresetById(isCrawlPresetId(presetId) ? presetId : DEFAULT_CRAWL_PRESET_ID);
  return { ...configState, ...preset.configPatch } as PipelineConfigState;
}
