/** Default models per provider — keep in sync with Python LLM clients. */
export const DEFAULT_LLM_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-3-5-haiku-latest',
  groq: 'openai/gpt-oss-120b',
  ollama: 'llama3.2',
};

/** Common models offered in the chat composer for cloud providers. */
export const LLM_MODEL_PRESETS: Record<string, readonly string[]> = {
  groq: [
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash-preview'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
};

export function defaultLlmModelForProvider(provider: string): string {
  return DEFAULT_LLM_MODEL_BY_PROVIDER[provider] ?? '';
}

export function effectiveLlmModel(provider: string, model: string | undefined): string {
  const trimmed = String(model ?? '').trim();
  if (trimmed) return trimmed;
  return defaultLlmModelForProvider(provider);
}

export function cloudModelPresets(provider: string): string[] {
  const presets = LLM_MODEL_PRESETS[provider];
  if (!presets?.length) return [];
  const defaultModel = defaultLlmModelForProvider(provider);
  const merged = defaultModel && !presets.includes(defaultModel)
    ? [defaultModel, ...presets]
    : [...presets];
  return [...new Set(merged)];
}

export function modelChipLabel(provider: string, model: string | undefined): string {
  const effective = effectiveLlmModel(provider, model);
  if (!effective) return '';
  const slash = effective.lastIndexOf('/');
  if (slash >= 0 && slash < effective.length - 1) {
    return effective.slice(slash + 1);
  }
  return effective.length > 20 ? `${effective.slice(0, 19)}…` : effective;
}

/** Never persist an empty llm_model when a provider is selected. */
export function ensurePersistedLlmModel(entries: Record<string, string>): Record<string, string> {
  const out = { ...entries };
  const provider = String(out.llm_provider || 'none');
  if (!String(out.llm_model || '').trim() && provider !== 'none') {
    const defaultModel = defaultLlmModelForProvider(provider);
    if (defaultModel) {
      out.llm_model = defaultModel;
    }
  }
  return out;
}
