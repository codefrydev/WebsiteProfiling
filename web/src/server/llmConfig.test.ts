import { describe, it, expect } from 'vitest';
import { maskLlmStateForClient } from '@/server/llmConfig';

describe('maskLlmStateForClient', () => {
  it('masks the legacy llm_api_key AND every per-provider key (regression: H1)', () => {
    const masked = maskLlmStateForClient({
      llm_provider: 'openai',
      llm_api_key: 'sk-secret-legacy-1234',
      llm_api_key_openai: 'sk-openai-abcd1234',
      llm_api_key_gemini: 'gem-secret-wxyz5678',
      llm_api_key_anthropic: 'sk-ant-secret-7890',
      llm_api_key_groq: 'gsk_secret_4321',
    });

    expect(masked.llm_api_key).toBe('••••1234');
    expect(masked.llm_api_key_openai).toBe('••••1234');
    expect(masked.llm_api_key_gemini).toBe('••••5678');
    expect(masked.llm_api_key_anthropic).toBe('••••7890');
    expect(masked.llm_api_key_groq).toBe('••••4321');

    // The masked flag is set so the client knows a value is stored.
    expect(masked.llm_api_key_openai_masked).toBe(true);

    // No plaintext secret material survives masking.
    for (const value of Object.values(masked)) {
      expect(String(value)).not.toContain('secret');
      expect(String(value)).not.toContain('sk-openai');
    }

    // Non-secret fields are untouched.
    expect(masked.llm_provider).toBe('openai');
  });

  it('leaves empty/absent secrets empty and unflagged', () => {
    const masked = maskLlmStateForClient({
      llm_provider: 'none',
      llm_api_key: '',
      llm_api_key_openai: '',
    });
    expect(masked.llm_api_key).toBe('');
    expect(masked.llm_api_key_openai).toBe('');
    expect(masked.llm_api_key_masked).toBeUndefined();
    expect(masked.llm_api_key_openai_masked).toBeUndefined();
  });

  it('does not double-mask an already-masked value', () => {
    const masked = maskLlmStateForClient({ llm_api_key_openai: '••••1234' });
    expect(masked.llm_api_key_openai).toBe('••••1234');
  });
});
