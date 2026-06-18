import { describe, expect, it } from 'vitest';
import {
  applyLlmModelChange,
  applyLlmProviderChange,
  llmProviderModelField,
  readStoredProviderModel,
} from '@/lib/llmProviderModels';

describe('llmProviderModels', () => {
  it('maps provider to model field key', () => {
    expect(llmProviderModelField('groq')).toBe('llm_model_groq');
    expect(llmProviderModelField('none')).toBe('');
  });

  it('restores previously stored model when switching back to a provider', () => {
    const state = {
      llm_provider: 'openai',
      llm_model: 'gpt-4o',
      llm_model_groq: 'llama-3.1-8b-instant',
      llm_model_openai: 'gpt-4o',
    };

    const toGroq = applyLlmProviderChange(state, 'groq');
    expect(toGroq.llm_provider).toBe('groq');
    expect(toGroq.llm_model).toBe('llama-3.1-8b-instant');
    expect(toGroq.llm_model_openai).toBe('gpt-4o');

    const backToOpenai = applyLlmProviderChange(toGroq, 'openai');
    expect(backToOpenai.llm_model).toBe('gpt-4o');
  });

  it('uses provider default when no stored model exists', () => {
    const next = applyLlmProviderChange(
      { llm_provider: 'openai', llm_model: 'gpt-4o' },
      'groq',
    );
    expect(next.llm_model).toBe('openai/gpt-oss-120b');
  });

  it('persists model under active provider when model changes', () => {
    const next = applyLlmModelChange(
      { llm_provider: 'groq', llm_model: 'openai/gpt-oss-120b' },
      'llama-3.1-8b-instant',
    );
    expect(next.llm_model).toBe('llama-3.1-8b-instant');
    expect(next.llm_model_groq).toBe('llama-3.1-8b-instant');
  });

  it('reads stored provider model from config', () => {
    expect(
      readStoredProviderModel({ llm_model_groq: 'llama-3.1-8b-instant' }, 'groq'),
    ).toBe('llama-3.1-8b-instant');
  });
});
