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

  it('masks the MCP token but not the non-secret MCP fields', () => {
    const masked = maskPipelineSecretsForClient({
      mcp_token: 'wp_mcp_secrettoken',
      mcp_allowed_hosts: 'audit.example.com',
      mcp_domain: 'core',
    });
    expect(masked.mcp_token).toBe('••••oken');
    expect(masked.mcp_token_masked).toBe(true);
    // Regression: these were masked to "••••.com" / "••••" and shown in text inputs.
    expect(masked.mcp_allowed_hosts).toBe('audit.example.com');
    expect(masked.mcp_allowed_hosts_masked).toBeUndefined();
    expect(masked.mcp_domain).toBe('core');
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

describe('saveSecrets', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('persists MCP fields entered on the /mcp page', async () => {
    const savePipelineConfig = vi.fn().mockResolvedValue('postgresql');
    vi.doMock('@/server/llmConfig', () => ({
      readLlmConfigRaw: vi.fn().mockResolvedValue({}),
      saveLlmConfig: vi.fn(),
    }));
    vi.doMock('@/server/pipelineConfig', () => ({
      loadPipelineConfig: vi.fn().mockResolvedValue({ state: {}, unknownKeys: [] }),
      savePipelineConfig,
    }));
    vi.doMock('@/server/googleAppSettings', () => ({
      loadGoogleAppSettings: vi
        .fn()
        .mockResolvedValue({ clientId: '', clientSecret: '', serviceAccount: null }),
      saveGoogleAppSettings: vi.fn(),
    }));

    const { saveSecrets } = await import('@/server/secrets');
    await saveSecrets({
      mcp_token: 'wp_mcp_newtoken123',
      mcp_allowed_hosts: 'audit.example.com',
      mcp_domain: 'google',
    });

    expect(savePipelineConfig).toHaveBeenCalledTimes(1);
    const savedState = (savePipelineConfig.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(savedState.mcp_token).toBe('wp_mcp_newtoken123');
    expect(savedState.mcp_allowed_hosts).toBe('audit.example.com');
    expect(savedState.mcp_domain).toBe('google');
  });
});
