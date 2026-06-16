import { describe, expect, it } from 'vitest';
import {
  cloudModelPresets,
  defaultLlmModelForProvider,
  effectiveLlmModel,
  ensurePersistedLlmModel,
  modelChipLabel,
} from '@/lib/llmProviderDefaults';

describe('llmProviderDefaults', () => {
  it('returns groq default model', () => {
    expect(defaultLlmModelForProvider('groq')).toBe('openai/gpt-oss-120b');
  });

  it('uses effective model when stored model is blank', () => {
    expect(effectiveLlmModel('groq', '')).toBe('openai/gpt-oss-120b');
    expect(effectiveLlmModel('groq', 'llama-3.1-8b-instant')).toBe('llama-3.1-8b-instant');
  });

  it('shortens groq model chip label', () => {
    expect(modelChipLabel('groq', 'openai/gpt-oss-120b')).toBe('gpt-oss-120b');
  });

  it('includes groq presets with default first', () => {
    expect(cloudModelPresets('groq')[0]).toBe('openai/gpt-oss-120b');
  });

  it('fills empty llm_model before database save', () => {
    const entries = ensurePersistedLlmModel({
      llm_provider: 'groq',
      llm_model: '',
    });
    expect(entries.llm_model).toBe('openai/gpt-oss-120b');
  });
});
