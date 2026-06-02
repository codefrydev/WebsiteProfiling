import type { PipelineConfigState } from '@/types/api';

export type PipelinePresetId =
  | 'full-audit'
  | 'crawl-only'
  | 'report-only'
  | 'lighthouse'
  | 'google-sync'
  | 'keywords-explorer';

export interface PipelinePreset {
  id: PipelinePresetId;
  command: string;
  configPatch?: Partial<PipelineConfigState>;
}

export const PIPELINE_PRESETS: PipelinePreset[] = [
  {
    id: 'full-audit',
    command: '',
    configPatch: {
      run_crawl: true,
      run_report: true,
      run_plot: true,
    },
  },
  { id: 'crawl-only', command: 'crawl' },
  { id: 'report-only', command: 'report' },
  { id: 'lighthouse', command: 'lighthouse' },
  { id: 'google-sync', command: 'google' },
  { id: 'keywords-explorer', command: 'keywords --enrich-google' },
];

export const DEFAULT_PRESET_ID: PipelinePresetId = 'full-audit';

export function getPresetById(id: PipelinePresetId): PipelinePreset {
  return PIPELINE_PRESETS.find((p) => p.id === id) ?? PIPELINE_PRESETS[0];
}

export function commandToPresetId(command: string): PipelinePresetId {
  const match = PIPELINE_PRESETS.find((p) => p.command === command);
  return match?.id ?? DEFAULT_PRESET_ID;
}

export function isPipelinePresetId(id: string): id is PipelinePresetId {
  return PIPELINE_PRESETS.some((p) => p.id === id);
}

export function applyPreset(
  presetId: PipelinePresetId,
  configState: PipelineConfigState,
): { command: string; configState: PipelineConfigState } {
  const preset = getPresetById(presetId);
  return {
    command: preset.command,
    configState: preset.configPatch
      ? ({ ...configState, ...preset.configPatch } as PipelineConfigState)
      : configState,
  };
}
