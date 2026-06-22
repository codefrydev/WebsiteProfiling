/**
 * LLM config stored in PostgreSQL, accessed via FastAPI (/api/llm-config).
 */
import {
  LLM_CONFIG_SECTIONS,
  ALL_LLM_SCHEMA_KEYS,
  getLlmFieldByKey,
  buildInitialLlmConfigState,
  isLlmSecretKey,
} from '@/lib/llmConfigSchema';
import {
  ALL_LLM_PROVIDER_API_KEY_KEYS,
  isLlmProviderApiKeyField,
  resolveLlmApiKey,
} from '@/lib/llmProviderApiKeys';
import { defaultLlmModelForProvider, ensurePersistedLlmModel } from '@/lib/llmProviderDefaults';
import {
  ALL_LLM_PROVIDER_MODEL_KEYS,
  backfillProviderModelsFromActive,
  llmProviderModelField,
} from '@/lib/llmProviderModels';
import { fastApiGet, fastApiPut } from '@/server/fastApiClient';
import type { LlmConfigLoadResult, LlmConfigState } from '@/types/api';

const MASK_SENTINEL = '__MASKED__';

async function readLlmConfigFromApi(): Promise<Record<string, string>> {
  try {
    const data = await fastApiGet<{ state?: Record<string, unknown> }>('/api/llm-config');
    const known: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.state ?? {})) {
      if (v != null) known[k] = String(v);
    }
    return known;
  } catch {
    return {};
  }
}

function applyLlmDefaults(parsedMap: Record<string, string>): LlmConfigState {
  const state = buildInitialLlmConfigState();
  for (const [key, rawValue] of Object.entries(parsedMap)) {
    if (!ALL_LLM_SCHEMA_KEYS.has(key)) continue;
    const field = getLlmFieldByKey(key);
    if (!field) continue;
    if (field.type === 'bool') {
      state[key] = ['true', '1', 'yes'].includes(String(rawValue).toLowerCase());
    } else {
      state[key] = String(rawValue ?? '');
    }
  }
  return state;
}

function applyProviderApiKeys(parsedMap: Record<string, string>, state: LlmConfigState): void {
  for (const key of ALL_LLM_PROVIDER_API_KEY_KEYS) {
    if (parsedMap[key] != null && String(parsedMap[key]).trim() !== '') {
      state[key] = String(parsedMap[key]);
    }
  }
}

function applyProviderModels(parsedMap: Record<string, string>, state: LlmConfigState): void {
  for (const key of ALL_LLM_PROVIDER_MODEL_KEYS) {
    if (parsedMap[key] != null && String(parsedMap[key]).trim() !== '') {
      state[key] = String(parsedMap[key]);
    }
  }
}

function writeSecretEntry(
  key: string,
  value: string | boolean | undefined,
  maskedFlag: string | boolean | undefined,
  existing: Record<string, string>,
  entries: Record<string, string>,
  secretKeys: Set<string>,
): void {
  const raw = value == null ? '' : String(value).trim();
  const isMasked =
    raw === '' ||
    raw === MASK_SENTINEL ||
    raw.startsWith('••••') ||
    maskedFlag === true;
  if (isMasked && existing[key]) {
    entries[key] = existing[key];
  } else if (raw && !raw.startsWith('••••')) {
    entries[key] = raw;
  } else {
    entries[key] = '';
  }
  if (entries[key]) secretKeys.add(key);
}

/** Mask any secret value (generic provider keys + the legacy llm_api_key). */
function maskSecretValue(value: string | boolean | undefined): string {
  if (!value || String(value).trim() === '') return '';
  const s = String(value);
  if (s.startsWith('••••')) return s;
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

export function maskLlmStateForClient(state: LlmConfigState): LlmConfigState {
  const out: LlmConfigState = { ...state };
  for (const key of Object.keys(out)) {
    // Mask BOTH the legacy llm_api_key and every per-provider key
    // (llm_api_key_openai/_gemini/_anthropic/_groq). The latter were
    // previously returned in plaintext because isLlmSecretKey only covers
    // llm_api_key, even though the save path treats them as secrets.
    if (isLlmSecretKey(key) || isLlmProviderApiKeyField(key)) {
      out[key] = maskSecretValue(out[key]);
      if (out[key]) out[`${key}_masked`] = true;
    }
  }
  return out;
}

export async function readLlmConfigRaw(): Promise<Record<string, string>> {
  return readLlmConfigFromApi();
}

export async function loadLlmConfig(): Promise<LlmConfigLoadResult> {
  const known = await readLlmConfigFromApi();
  let loaded: { state: LlmConfigState; source: 'store' | 'defaults'; backfillModel: boolean };

  if (Object.keys(known).length > 0) {
    const state = applyLlmDefaults(known);
    applyProviderApiKeys(known, state);
    applyProviderModels(known, state);
    backfillProviderModelsFromActive(known, state);
    const resolved = resolveLlmApiKey({ ...known, ...state });
    if (resolved) {
      state.llm_api_key = resolved;
    }
    const provider = String(state.llm_provider || 'none');
    const dbModelEmpty = !String(known.llm_model || '').trim();
    if (!String(state.llm_model || '').trim() && provider !== 'none') {
      state.llm_model = defaultLlmModelForProvider(provider);
    }
    const providerModelField = llmProviderModelField(provider);
    const providerModelMissing =
      provider !== 'none' &&
      Boolean(providerModelField) &&
      !String(known[providerModelField] || '').trim() &&
      Boolean(String(state.llm_model || '').trim());
    loaded = {
      state,
      source: 'store',
      backfillModel: (dbModelEmpty && provider !== 'none') || providerModelMissing,
    };
  } else {
    loaded = {
      state: buildInitialLlmConfigState(),
      source: 'defaults',
      backfillModel: false,
    };
  }

  if (loaded.backfillModel) {
    await saveLlmConfig(loaded.state);
  }

  return {
    state: maskLlmStateForClient(loaded.state),
    source: loaded.source,
  };
}

export interface SaveLlmConfigOptions {
  preserveSecrets?: boolean;
}

export async function saveLlmConfig(
  state: LlmConfigState,
  { preserveSecrets = true }: SaveLlmConfigOptions = {},
): Promise<string> {
  const existing = preserveSecrets ? await readLlmConfigFromApi() : {};

  const entries: Record<string, string> = {};
  const secretKeys = new Set<string>();
  for (const section of LLM_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      const v = state[f.key];
      if (v === undefined) continue;
      if (f.type === 'bool') {
        entries[f.key] = v === true ? 'true' : 'false';
      } else if (isLlmSecretKey(f.key) || isLlmProviderApiKeyField(f.key)) {
        writeSecretEntry(f.key, v, state[`${f.key}_masked`], existing, entries, secretKeys);
      } else {
        entries[f.key] = v == null ? '' : String(v);
      }
    }
  }

  for (const key of ALL_LLM_PROVIDER_API_KEY_KEYS) {
    if (state[key] !== undefined) {
      writeSecretEntry(key, state[key], state[`${key}_masked`], existing, entries, secretKeys);
    } else if (existing[key] && entries[key] === undefined) {
      entries[key] = existing[key];
      secretKeys.add(key);
    }
  }

  for (const key of ALL_LLM_PROVIDER_MODEL_KEYS) {
    if (state[key] !== undefined) {
      entries[key] = state[key] == null ? '' : String(state[key]);
    } else if (existing[key] && entries[key] === undefined) {
      entries[key] = existing[key];
    }
  }

  for (const section of LLM_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      if (entries[f.key] !== undefined) continue;
      if (existing[f.key] !== undefined) {
        entries[f.key] = existing[f.key];
        if (isLlmSecretKey(f.key) && existing[f.key]) {
          secretKeys.add(f.key);
        }
      }
    }
  }

  const persistedEntries = ensurePersistedLlmModel(entries);
  await fastApiPut('/api/llm-config', { state: persistedEntries });
  return 'postgresql';
}

export { MASK_SENTINEL };
