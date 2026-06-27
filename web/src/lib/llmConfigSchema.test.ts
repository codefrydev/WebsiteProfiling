import { describe, expect, it } from 'vitest';
import {
  isLlmInsightsEnabled,
  normalizeLlmConfigState,
  parseLlmBool,
} from '@/lib/llmConfigSchema';

describe('llmConfigSchema', () => {
  it('parseLlmBool accepts PostgreSQL string values', () => {
    expect(parseLlmBool('true')).toBe(true);
    expect(parseLlmBool('false')).toBe(false);
    expect(parseLlmBool(true)).toBe(true);
  });

  it('isLlmInsightsEnabled treats string llm_enabled as enabled', () => {
    expect(
      isLlmInsightsEnabled({
        llm_enabled: 'true',
        llm_provider: 'openai',
      }),
    ).toBe(true);
  });

  it('normalizeLlmConfigState coerces bool fields from API strings', () => {
    const normalized = normalizeLlmConfigState({
      llm_enabled: 'true',
      llm_provider: 'ollama',
      llm_chat_allow_crawl: 'false',
    });
    expect(normalized.llm_enabled).toBe(true);
    expect(normalized.llm_chat_allow_crawl).toBe(false);
  });

  it('normalizeLlmConfigState preserves per-provider API keys from DB', () => {
    const normalized = normalizeLlmConfigState({
      llm_provider: 'groq',
      llm_api_key_groq: '*',
      llm_model_groq: 'openai/gpt-oss-120b',
    });
    expect(normalized.llm_api_key_groq).toBe('*');
    expect(normalized.llm_model_groq).toBe('openai/gpt-oss-120b');
  });

  it('parseLlmBool handles unlimited tool rounds from DB strings', () => {
    expect(parseLlmBool('true')).toBe(true);
    expect(parseLlmBool('false')).toBe(false);
  });
});
