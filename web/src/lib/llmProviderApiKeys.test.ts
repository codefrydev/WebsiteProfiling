import { describe, expect, it } from 'vitest';
import {
  llmProviderApiKeyField,
  resolveLlmApiKey,
} from '@/lib/llmProviderApiKeys';

describe('resolveLlmApiKey', () => {
  it('uses per-provider key for the active provider', () => {
    expect(
      resolveLlmApiKey({
        llm_provider: 'groq',
        llm_api_key_groq: 'gsk-provider-key',
        llm_api_key_openai: 'sk-openai',
      }),
    ).toBe('gsk-provider-key');
  });

  it('falls back to legacy llm_api_key when provider key is missing', () => {
    expect(
      resolveLlmApiKey({
        llm_provider: 'openai',
        llm_api_key: 'sk-legacy',
      }),
    ).toBe('sk-legacy');
  });

  it('ignores masked values', () => {
    expect(
      resolveLlmApiKey({
        llm_provider: 'openai',
        llm_api_key_openai: '••••cdef',
      }),
    ).toBe('');
  });
});

describe('llmProviderApiKeyField', () => {
  it('names keys consistently', () => {
    expect(llmProviderApiKeyField('openai')).toBe('llm_api_key_openai');
    expect(llmProviderApiKeyField('groq')).toBe('llm_api_key_groq');
  });
});
