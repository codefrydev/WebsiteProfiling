/**
 * LLM config stored only in PostgreSQL (llm_config table). No shadow file.
 */
import type { PoolClient } from 'pg';
import {
  LLM_CONFIG_SECTIONS,
  ALL_LLM_SCHEMA_KEYS,
  getLlmFieldByKey,
  buildInitialLlmConfigState,
  maskLlmSecretForClient,
  isLlmSecretKey,
} from '@/lib/llmConfigSchema';
import {
  ALL_LLM_PROVIDER_API_KEY_KEYS,
  isLlmProviderApiKeyField,
  resolveLlmApiKey,
} from '@/lib/llmProviderApiKeys';
import { defaultLlmModelForProvider, ensurePersistedLlmModel } from '@/lib/llmProviderDefaults';
import { withDb } from '@/server/db';
import type { LlmConfigLoadResult, LlmConfigState } from '@/types/api';

const MASK_SENTINEL = '__MASKED__';

async function readLlmConfigFromDb(client: PoolClient): Promise<Record<string, string>> {
  const known: Record<string, string> = {};
  try {
    const { rows } = await client.query(
      'SELECT key, value, is_secret FROM llm_config ORDER BY key',
    );
    for (const row of rows) {
      known[String(row.key)] = String(row.value);
    }
  } catch {
    /* empty */
  }
  return known;
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

export function maskLlmStateForClient(state: LlmConfigState): LlmConfigState {
  const out: LlmConfigState = { ...state };
  for (const key of Object.keys(out)) {
    if (isLlmSecretKey(key)) {
      out[key] = maskLlmSecretForClient(key, out[key]);
      if (out[key]) out[`${key}_masked`] = true;
    }
  }
  return out;
}

export async function readLlmConfigRaw(): Promise<Record<string, string>> {
  return withDb(readLlmConfigFromDb);
}

export async function loadLlmConfig(): Promise<LlmConfigLoadResult> {
  const loaded = await withDb(async (client: PoolClient) => {
    const known = await readLlmConfigFromDb(client);
    if (Object.keys(known).length > 0) {
      const state = applyLlmDefaults(known);
      applyProviderApiKeys(known, state);
      const resolved = resolveLlmApiKey({ ...known, ...state });
      if (resolved) {
        state.llm_api_key = resolved;
      }
      const provider = String(state.llm_provider || 'none');
      const dbModelEmpty = !String(known.llm_model || '').trim();
      if (!String(state.llm_model || '').trim() && provider !== 'none') {
        state.llm_model = defaultLlmModelForProvider(provider);
      }
      return {
        state,
        source: 'store' as const,
        backfillModel: dbModelEmpty && provider !== 'none',
      };
    }
    return {
      state: buildInitialLlmConfigState(),
      source: 'defaults' as const,
      backfillModel: false,
    };
  });

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
  await withDb(async (client: PoolClient) => {
    const existing = preserveSecrets ? await readLlmConfigFromDb(client) : {};

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

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM llm_config');
      for (const [k, v] of Object.entries(persistedEntries)) {
        await client.query(
          'INSERT INTO llm_config (key, value, is_secret, updated_at) VALUES ($1, $2, $3, $4)',
          [k, v, secretKeys.has(k), now],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
  return 'postgresql';
}

export { MASK_SENTINEL };
