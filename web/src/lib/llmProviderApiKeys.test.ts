import { describe, expect, it } from 'vitest';
import {
  llmProviderApiKeyField,
  resolveLlmApiKey,
  isLlmApiKeyConfigured,
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

  it('ignores masked values for resolution', () => {
    expect(
      resolveLlmApiKey({
        llm_provider: 'openai',
        llm_api_key_openai: '••••cdef',
      }),
    ).toBe('');
  });

  it('treats masked DB values as configured', () => {
    expect(
      isLlmApiKeyConfigured({
        llm_provider: 'groq',
        llm_api_key_groq: '*',
      }),
    ).toBe(true);
  });

  it('reports missing key for cloud provider without stored value', () => {
    expect(
      isLlmApiKeyConfigured({
        llm_provider: 'groq',
      }),
    ).toBe(false);
  });

  it('treats ollama as not needing an API key', () => {
    expect(isLlmApiKeyConfigured({ llm_provider: 'ollama' })).toBe(true);
  });
});

describe('llmProviderApiKeyField', () => {
  it('names keys consistently', () => {
    expect(llmProviderApiKeyField('openai')).toBe('llm_api_key_openai');
    expect(llmProviderApiKeyField('groq')).toBe('llm_api_key_groq');
  });
});
