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

export async function loadLlmConfig(): Promise<LlmConfigLoadResult> {
  return withDb(async (client: PoolClient) => {
    const known = await readLlmConfigFromDb(client);
    if (Object.keys(known).length > 0) {
      const state = applyLlmDefaults(known);
      return { state: maskLlmStateForClient(state), source: 'store' };
    }
    return { state: maskLlmStateForClient(buildInitialLlmConfigState()), source: 'defaults' };
  });
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
        } else if (isLlmSecretKey(f.key)) {
          const raw = v == null ? '' : String(v).trim();
          const isMasked =
            raw === '' ||
            raw === MASK_SENTINEL ||
            raw.startsWith('••••') ||
            state[`${f.key}_masked`] === true;
          if (isMasked && existing[f.key]) {
            entries[f.key] = existing[f.key];
          } else if (raw && !raw.startsWith('••••')) {
            entries[f.key] = raw;
          } else {
            entries[f.key] = '';
          }
          if (entries[f.key]) secretKeys.add(f.key);
        } else {
          entries[f.key] = v == null ? '' : String(v);
        }
      }
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM llm_config');
      for (const [k, v] of Object.entries(entries)) {
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
