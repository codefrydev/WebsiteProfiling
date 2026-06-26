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
    expect(patch.settings.providerProfiles).toEqual([
      { provider: 'openai', savedModel: 'gpt-4o-mini' },
    ]);
  });

  it('emits providerProfiles for multiple provider model slots', () => {
    const flat = llmSettingsDtoToFlatState({
      enabled: true,
      provider: 'groq',
      activeModel: 'openai/gpt-oss-120b',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      enableNer: true,
      enableKeyphrases: true,
      enableSimilarInternal: true,
      enableKeywordClusters: true,
      enableIssueFixes: true,
      enableAuditSummary: true,
      enablePageCoach: true,
      enableContentStudio: true,
      enableDashboards: true,
      chatAssistantName: '',
      chatAssistantAvatarUrl: '',
      chatUnlimitedToolRounds: false,
      chatAllowCrawl: false,
      chatFastNarrative: false,
      maxPages: 60,
      batchSize: 5,
      concurrency: 2,
      timeoutSeconds: 120,
      similarTopK: 5,
      providers: [
        { provider: 'groq', savedModel: 'openai/gpt-oss-120b' },
        { provider: 'openai', savedModel: 'gpt-4o-mini' },
      ],
    });

    const patch = flatStateToLlmSettingsPatch(flat);
    expect(patch.settings.provider).toBe('groq');
    expect(patch.settings.providerProfiles).toEqual(
      expect.arrayContaining([
        { provider: 'groq', savedModel: 'openai/gpt-oss-120b' },
        { provider: 'openai', savedModel: 'gpt-4o-mini' },
      ]),
    );
  });
});
