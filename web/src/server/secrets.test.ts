import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  maskSecretForClient,
  PIPELINE_SECRET_KEYS,
} from '@/lib/secretsConfigSchema';
import {
  maskPipelineSecretsForClient,
  serializeConfig,
} from '@/server/pipelineConfig';

describe('maskSecretForClient', () => {
  it('masks values with last four characters', () => {
    expect(maskSecretForClient('sk-test-secret-key')).toBe('••••-key');
  });

  it('returns empty for blank values', () => {
    expect(maskSecretForClient('')).toBe('');
  });
});

describe('maskPipelineSecretsForClient', () => {
  it('masks pipeline secret keys', () => {
    const masked = maskPipelineSecretsForClient({
      bing_webmaster_api_key: 'bing-secret-1234',
      start_url: 'https://example.com',
    });
    expect(masked.bing_webmaster_api_key).toBe('••••1234');
    expect(masked.bing_webmaster_api_key_masked).toBe(true);
    expect(masked.start_url).toBe('https://example.com');
  });
});

describe('serializeConfig', () => {
  it('omits pipeline secret keys from shadow output', () => {
    const content = serializeConfig({
      start_url: 'https://example.com',
      bing_webmaster_api_key: 'should-not-appear',
      serp_api_key: 'hidden',
      crawl_auth_password: 'hidden',
      crawl_cookies: 'hidden',
      google_rich_results_api_key: 'hidden',
    });
    expect(content).toContain('start_url = https://example.com');
    for (const key of PIPELINE_SECRET_KEYS) {
      expect(content).not.toContain(`${key} =`);
    }
  });
});

describe('loadSecrets', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('aggregates masked secrets from stores', async () => {
    vi.doMock('@/server/llmConfig', () => ({
      readLlmConfigRaw: vi.fn().mockResolvedValue({
        llm_provider: 'openai',
        llm_api_key_openai: 'sk-openai-secret',
      }),
      saveLlmConfig: vi.fn(),
    }));
    vi.doMock('@/server/pipelineConfig', () => ({
      loadPipelineConfig: vi.fn().mockResolvedValue({
        state: {
          bing_webmaster_api_key: '••••1234',
          bing_webmaster_api_key_masked: true,
        },
        unknownKeys: [],
      }),
    }));
    vi.doMock('@/server/googleAppSettings', () => ({
      loadGoogleAppSettings: vi.fn().mockResolvedValue({
        clientId: 'client.apps.googleusercontent.com',
        clientSecret: 'secret',
        serviceAccount: null,
        dateRangeDays: 28,
      }),
    }));

    const { loadSecrets } = await import('@/server/secrets');
    const result = await loadSecrets();
    expect(result.state.llm_api_key_openai).toBe('••••cret');
    expect(result.state.llm_api_key_openai_masked).toBe(true);
    expect(result.state.google_client_id).toBe('client.apps.googleusercontent.com');
    expect(result.state.google_client_secret).toBe('••••cret');
    expect(result.envHints).toBeTypeOf('object');
  });
});
