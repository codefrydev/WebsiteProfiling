import { describe, expect, it } from 'vitest';
import {
  buildInitialSecretsState,
  buildSecretsSavePayload,
  isSecretMaskedStored,
} from '@/lib/secretsConfigSchema';

describe('secretsConfigSchema', () => {
  it('isSecretMaskedStored recognizes API mask sentinels', () => {
    expect(isSecretMaskedStored('*')).toBe(true);
    expect(isSecretMaskedStored('••••abcd')).toBe(true);
    expect(isSecretMaskedStored('gsk-live-key')).toBe(false);
  });

  it('buildSecretsSavePayload omits blank secrets and unchanged masked values', () => {
    const baseline = {
      ...buildInitialSecretsState(),
      llm_api_key_groq: '*',
      llm_api_key_groq_masked: true,
    };
    const state = {
      ...baseline,
      bing_webmaster_api_key: 'bing-key',
      google_client_id: 'client.apps.googleusercontent.com',
    };

    const payload = buildSecretsSavePayload(state, baseline);

    expect(payload.bing_webmaster_api_key).toBe('bing-key');
    expect(payload.llm_api_key_groq).toBeUndefined();
    expect(payload.llm_api_key_openai).toBeUndefined();
    expect(payload.google_client_id).toBe('client.apps.googleusercontent.com');
  });

  it('buildSecretsSavePayload sends only changed secret values', () => {
    const baseline = {
      ...buildInitialSecretsState(),
      llm_api_key_groq: '*',
      llm_api_key_groq_masked: true,
      llm_api_key_openai: '*',
      llm_api_key_openai_masked: true,
    };
    const state = {
      ...baseline,
      llm_api_key_groq: 'gsk-new-key',
    };

    const payload = buildSecretsSavePayload(state, baseline);

    expect(payload.llm_api_key_groq).toBe('gsk-new-key');
    expect(payload.llm_api_key_openai).toBeUndefined();
  });
});
