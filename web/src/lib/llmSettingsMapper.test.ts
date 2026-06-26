import { describe, expect, it } from 'vitest';
import { flatStateToLlmSettingsPatch, llmSettingsDtoToFlatState } from '@/lib/llmSettingsMapper';
import type { LlmSettingsDto } from '@/lib/llmSettingsMapper';

describe('llmSettingsMapper', () => {
  it('round-trips core LLM fields', () => {
    const dto: LlmSettingsDto = {
      enabled: true,
      provider: 'openai',
      activeModel: 'gpt-4o-mini',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      enableNer: true,
      enableKeyphrases: false,
      enableSimilarInternal: true,
      enableKeywordClusters: true,
      enableIssueFixes: true,
      enableAuditSummary: true,
      enablePageCoach: true,
      enableContentStudio: true,
      enableDashboards: false,
      chatAssistantName: 'Coach',
      chatAssistantAvatarUrl: '',
      chatUnlimitedToolRounds: false,
      chatAllowCrawl: false,
      chatFastNarrative: false,
      maxPages: 60,
      batchSize: 5,
      concurrency: 2,
      timeoutSeconds: 120,
      similarTopK: 5,
      providers: [{ provider: 'openai', savedModel: 'gpt-4o-mini' }],
    };

    const flat = llmSettingsDtoToFlatState(dto);
    expect(flat.llm_enabled).toBe(true);
    expect(flat.llm_provider).toBe('openai');
    expect(flat.llm_model).toBe('gpt-4o-mini');
    expect(flat.llm_model_openai).toBe('gpt-4o-mini');

    const patch = flatStateToLlmSettingsPatch(flat);
    expect(patch.settings.provider).toBe('openai');
    expect(patch.settings.maxPages).toBe(60);
  });
});
