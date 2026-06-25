/**
 * Per-provider LLM API keys stored in llm_config (llm_api_key_<provider>).
 * The active provider from Pipeline → Content & AI resolves to llm_api_key at runtime.
 */
export const LLM_CLOUD_PROVIDERS = ['openai', 'gemini', 'anthropic', 'groq'] as const;

export type LlmCloudProvider = (typeof LLM_CLOUD_PROVIDERS)[number];

export const LLM_PROVIDER_LABELS: Record<LlmCloudProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  groq: 'Groq',
};

export const LLM_PROVIDER_ENV_VARS: Record<LlmCloudProvider, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
};

export function llmProviderApiKeyField(provider: LlmCloudProvider): string {
  return `llm_api_key_${provider}`;
}

export const ALL_LLM_PROVIDER_API_KEY_KEYS = new Set(
  LLM_CLOUD_PROVIDERS.map((provider) => llmProviderApiKeyField(provider)),
);

export function isLlmProviderApiKeyField(key: string): boolean {
  return ALL_LLM_PROVIDER_API_KEY_KEYS.has(key);
}

export function isLlmCloudProvider(provider: string): provider is LlmCloudProvider {
  return (LLM_CLOUD_PROVIDERS as readonly string[]).includes(provider);
}

/** Masked DB / secrets values mean a key is stored server-side. */
export function isLlmApiKeyMaskedStored(value: string | boolean | undefined): boolean {
  if (value === true) return true;
  const trimmed = String(value ?? '').trim();
  return trimmed === '*' || trimmed.startsWith('••••') || trimmed === '{configured}';
}

/**
 * True when the active provider has an API key in Postgres (masked `*` counts) or Ollama (no key).
 * Pass `serverConfigured` from GET /llm-config when available (includes env vars).
 */
export function isLlmApiKeyConfigured(
  cfg: Record<string, string | boolean | undefined>,
  options?: { provider?: string; serverConfigured?: boolean },
): boolean {
  if (options?.serverConfigured === true) {
    return true;
  }

  const selected = (options?.provider ?? String(cfg.llm_provider ?? 'none')).trim().toLowerCase();
  if (!selected || selected === 'none') return false;
  if (selected === 'ollama') return true;

  if (isLlmCloudProvider(selected)) {
    const field = llmProviderApiKeyField(selected);
    if (cfg[`${field}_masked`] === true) return true;
    const perProvider = String(cfg[field] ?? '').trim();
    if (perProvider && !isLlmApiKeyMaskedStored(perProvider)) return true;
    if (isLlmApiKeyMaskedStored(perProvider)) return true;
  }

  if (cfg.llm_api_key_masked === true) return true;
  const legacy = String(cfg.llm_api_key ?? '').trim();
  if (legacy && !isLlmApiKeyMaskedStored(legacy)) return true;
  return isLlmApiKeyMaskedStored(legacy);
}

/** Resolve the API key for the selected (or given) cloud provider. */
export function resolveLlmApiKey(
  cfg: Record<string, string | boolean | undefined>,
  provider?: string,
): string {
  const selected = (provider ?? String(cfg.llm_provider ?? 'none')).trim().toLowerCase();
  if (isLlmCloudProvider(selected)) {
    const field = llmProviderApiKeyField(selected);
    const perProvider = String(cfg[field] ?? '').trim();
    if (perProvider && !isLlmApiKeyMaskedStored(perProvider)) {
      return perProvider;
    }
  }
  const legacy = String(cfg.llm_api_key ?? '').trim();
  if (legacy && !isLlmApiKeyMaskedStored(legacy)) {
    return legacy;
  }
  return '';
}
