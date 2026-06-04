export type PipelineSettingsGroupId =
  | 'crawl-report'
  | 'lighthouse'
  | 'keywords'
  | 'google'
  | 'content-ai'
  | 'advanced';

export interface PipelineSettingsGroup {
  id: PipelineSettingsGroupId;
  /** Key under strings.pipelineRunner.settingsGroups */
  labelKey: string;
  sectionIds: string[];
  includesLlm?: boolean;
  defaultOpen?: boolean;
}

export const PIPELINE_SETTINGS_GROUPS: PipelineSettingsGroup[] = [
  {
    id: 'crawl-report',
    labelKey: 'crawlReport',
    sectionIds: ['crawl', 'report', 'pipeline'],
    defaultOpen: true,
  },
  {
    id: 'lighthouse',
    labelKey: 'lighthouse',
    sectionIds: ['lighthouse'],
  },
  {
    id: 'keywords',
    labelKey: 'keywords',
    sectionIds: ['keywords_basics', 'keywords_expansion'],
  },
  {
    id: 'google',
    labelKey: 'google',
    sectionIds: ['google'],
  },
  {
    id: 'content-ai',
    labelKey: 'contentAi',
    sectionIds: ['analysis'],
    includesLlm: true,
  },
  {
    id: 'advanced',
    labelKey: 'advanced',
    sectionIds: ['advanced'],
  },
];
