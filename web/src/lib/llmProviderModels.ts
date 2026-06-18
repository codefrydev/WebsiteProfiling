/**
 * Per-provider LLM models stored in llm_config (llm_model_<provider>).
 * The active llm_model follows llm_provider; slots remember each provider's last choice.
 */
import type { LlmConfigState } from '@/types/api';
import { defaultLlmModelForProvider } from '@/lib/llmProviderDefaults';

export const LLM_MODEL_PROVIDERS = ['openai', 'gemini', 'anthropic', 'groq', 'ollama'] as const;

export type LlmModelProvider = (typeof LLM_MODEL_PROVIDERS)[number];

export function llmProviderModelField(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (!normalized || normalized === 'none') return '';
  return `llm_model_${normalized}`;
}

export const ALL_LLM_PROVIDER_MODEL_KEYS = new Set(
  LLM_MODEL_PROVIDERS.map((provider) => llmProviderModelField(provider)),
);

export function isLlmProviderModelField(key: string): boolean {
  return ALL_LLM_PROVIDER_MODEL_KEYS.has(key);
}

export function readStoredProviderModel(cfg: LlmConfigState, provider: string): string {
  const field = llmProviderModelField(provider);
  if (!field) return '';
  return String(cfg[field] ?? '').trim();
}

/** Switch llm_provider and restore the model saved for the new provider. */
export function applyLlmProviderChange(prev: LlmConfigState, nextProvider: string): LlmConfigState {
  const prevProvider = String(prev.llm_provider || 'none');
  const prevModel = String(prev.llm_model || '').trim();
  const next: LlmConfigState = {
    ...prev,
    llm_provider: nextProvider,
  };

  const prevField = llmProviderModelField(prevProvider);
  if (prevField && prevProvider !== 'none' && prevModel) {
    next[prevField] = prevModel;
  }

  const stored = readStoredProviderModel(prev, nextProvider);
  next.llm_model = stored || defaultLlmModelForProvider(nextProvider);
  return next;
}

/** Update llm_model and persist under the active provider slot. */
export function applyLlmModelChange(prev: LlmConfigState, model: string): LlmConfigState {
  const provider = String(prev.llm_provider || 'none');
  const trimmed = model.trim();
  const next: LlmConfigState = { ...prev, llm_model: trimmed };
  const field = llmProviderModelField(provider);
  if (field && provider !== 'none' && trimmed) {
    next[field] = trimmed;
  }
  return next;
}

/** Backfill llm_model_<provider> from active llm_model when loading legacy rows. */
export function backfillProviderModelsFromActive(
  parsedMap: Record<string, string>,
  state: LlmConfigState,
): void {
  const provider = String(state.llm_provider || 'none');
  const activeModel = String(state.llm_model || '').trim();
  if (provider === 'none' || !activeModel) return;
  const field = llmProviderModelField(provider);
  if (!field) return;
  if (!String(parsedMap[field] || '').trim()) {
    state[field] = activeModel;
  }
}
