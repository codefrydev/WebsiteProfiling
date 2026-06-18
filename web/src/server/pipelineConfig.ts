/**
 * Pipeline config stored in PostgreSQL (pipeline_config table).
 *
 * PostgreSQL is the single source of truth. A shadow `pipeline-config.txt` is
 * written to DATA_DIR on every Save/Run for CLI back-compat.
 */
import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import {
  PIPELINE_CONFIG_SECTIONS,
  ALL_SCHEMA_KEYS,
  INTERNAL_PIPELINE_KEYS,
  getFieldByKey,
} from '@/lib/pipelineConfigSchema';
import {
  isPipelineHiddenKey,
  isPipelineSecretKey,
  maskSecretForClient,
  SECRETS_MASK_SENTINEL,
} from '@/lib/secretsConfigSchema';
import { getDataDir, withDb } from '@/server/db';
import type {
  PipelineConfigLoadResult,
  PipelineConfigState,
  PipelineUnknownKey,
} from '@/types/api';

/** Shadow key=value file written to DATA_DIR for CLI back-compat. */
export function getShadowConfigPath(): string {
  return path.join(getDataDir(), 'pipeline-config.txt');
}

/** Parse `key = value` / `key: value` text (# comments, blank lines ignored). */
export function parseInputTxt(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    let k: string;
    let v: string;
    if (line.includes('=')) {
      const sep = line.indexOf('=');
      k = line.slice(0, sep).trim();
      v = line.slice(sep + 1).trim();
    } else if (line.includes(':')) {
      const sep = line.indexOf(':');
      k = line.slice(0, sep).trim();
      v = line.slice(sep + 1).trim();
    } else {
      continue;
    }
    if (k) result[k] = v;
  }
  return result;
}

function buildDefaults(): PipelineConfigState {
  const out: PipelineConfigState = {};
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === 'bool') {
        out[f.key] = f.defaultValue as boolean;
      } else if (f.type === 'tristate') {
        out[f.key] = (f.defaultValue ?? 'auto') as string;
      } else {
        out[f.key] = String(f.defaultValue ?? '');
      }
    }
  }
  return out;
}

export function applySchemaDefaults(parsedMap: Record<string, string>): {
  state: PipelineConfigState;
  unknownKeys: PipelineUnknownKey[];
} {
  const { state, unknownKeys } = applySchemaDefaultsRaw(parsedMap);
  return { state: maskPipelineSecretsForClient(state), unknownKeys };
}

function applySchemaDefaultsRaw(parsedMap: Record<string, string>): {
  state: PipelineConfigState;
  unknownKeys: PipelineUnknownKey[];
} {
  const state = buildDefaults();
  const unknownKeys: PipelineUnknownKey[] = [];

  for (const [key, rawValue] of Object.entries(parsedMap)) {
    if (!ALL_SCHEMA_KEYS.has(key)) {
      unknownKeys.push({ key, value: rawValue });
      continue;
    }
    const field = getFieldByKey(key);
    if (!field) continue;

    if (field.type === 'bool') {
      state[key] = ['true', '1', 'yes'].includes(String(rawValue).toLowerCase());
    } else if (field.type === 'tristate') {
      const lv = String(rawValue).toLowerCase();
      if (lv === 'true' || lv === '1' || lv === 'yes') state[key] = 'true';
      else if (lv === 'false' || lv === '0' || lv === 'no') state[key] = 'false';
      else state[key] = 'auto';
    } else {
      state[key] = rawValue;
    }
  }

  return { state, unknownKeys };
}

export function maskPipelineSecretsForClient(state: PipelineConfigState): PipelineConfigState {
  const out: PipelineConfigState = { ...state };
  for (const key of Object.keys(out)) {
    if (!isPipelineSecretKey(key)) continue;
    const masked = maskSecretForClient(out[key]);
    if (masked) {
      out[key] = masked;
      out[`${key}_masked`] = true;
    }
  }
  return out;
}

function isMaskedSecretInput(
  raw: string,
  state: PipelineConfigState,
  key: string,
): boolean {
  const trimmed = raw.trim();
  return (
    trimmed === '' ||
    trimmed === SECRETS_MASK_SENTINEL ||
    trimmed.startsWith('••••') ||
    state[`${key}_masked`] === true
  );
}

export function serializeConfig(
  state: PipelineConfigState,
  unknownKeys: PipelineUnknownKey[] = [],
): string {
  const lines = [
    '# Site Audit config (shadow of pipeline_config table)',
    '# Regenerated automatically by the web UI on every Save/Run.',
    '# To use for CLI: python -m src --config pipeline-config.txt',
    '',
  ];
  const seenIds = new Set<string>();
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    if (seenIds.has(section.id)) continue;
    seenIds.add(section.id);
    lines.push(`# --- ${section.label} ---`);
    for (const f of section.fields) {
      if (isPipelineHiddenKey(f.key)) continue;
      const v = state[f.key];
      if (f.type === 'bool') {
        lines.push(`${f.key} = ${v === true ? 'true' : 'false'}`);
      } else if (f.type === 'tristate') {
        if (v === 'auto' || v == null) continue;
        lines.push(`${f.key} = ${v === 'true' ? 'true' : 'false'}`);
      } else {
        lines.push(`${f.key} = ${v == null ? '' : String(v)}`);
      }
    }
    lines.push('');
  }
  for (const key of INTERNAL_PIPELINE_KEYS) {
    const v = state[key];
    if (v != null && String(v).trim() !== '') {
      lines.push(`${key} = ${String(v)}`);
    }
  }
  if (unknownKeys.length > 0) {
    lines.push('# --- custom ---');
    for (const { key, value } of unknownKeys) {
      lines.push(`${key} = ${value}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function writeShadowFile(state: PipelineConfigState, unknownKeys: PipelineUnknownKey[]): void {
  const shadowPath = getShadowConfigPath();
  const dir = path.dirname(shadowPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = serializeConfig(state, unknownKeys);
  const tmp = shadowPath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, shadowPath);
}

function isLegacyOrLlmKey(key: string): boolean {
  return key.startsWith('llm_') || key.startsWith('ml_');
}

function filterUnknownKeys(list: PipelineUnknownKey[] | undefined): PipelineUnknownKey[] {
  return (list || []).filter((u) => u && !isLegacyOrLlmKey(u.key));
}

async function readPipelineConfigFromDb(client: PoolClient): Promise<{
  known: Record<string, string>;
  unknown: PipelineUnknownKey[];
}> {
  const known: Record<string, string> = {};
  const unknown: PipelineUnknownKey[] = [];
  try {
    const { rows } = await client.query(
      'SELECT key, value, is_unknown FROM pipeline_config ORDER BY key',
    );
    for (const row of rows) {
      if (row.is_unknown) {
        unknown.push({ key: String(row.key), value: String(row.value) });
      } else {
        known[String(row.key)] = String(row.value);
      }
    }
  } catch {
    /* table may not exist before migrations */
  }
  return { known, unknown };
}

export async function loadPipelineConfig(): Promise<PipelineConfigLoadResult> {
  return withDb(async (client: PoolClient) => {
    const { known, unknown } = await readPipelineConfigFromDb(client);

    if (Object.keys(known).length > 0 || unknown.length > 0) {
      const { state, unknownKeys: schemaUnknown } = applySchemaDefaultsRaw(known);
      const allUnknown = filterUnknownKeys([...unknown, ...schemaUnknown]);
      return { state: maskPipelineSecretsForClient(state), unknownKeys: allUnknown, source: 'store' };
    }

    const shadowPath = getShadowConfigPath();
    if (fs.existsSync(shadowPath)) {
      try {
        const raw = fs.readFileSync(shadowPath, 'utf8');
        const parsed = parseInputTxt(raw);
        if (Object.keys(parsed).length > 0) {
          const { state, unknownKeys } = applySchemaDefaultsRaw(parsed);
          return { state: maskPipelineSecretsForClient(state), unknownKeys: filterUnknownKeys(unknownKeys), source: 'legacy' };
        }
      } catch {
        /* fall through */
      }
    }

    return { state: buildDefaults(), unknownKeys: [], source: 'defaults' };
  });
}

export interface SavePipelineConfigOptions {
  unknownKeys?: PipelineUnknownKey[];
  preserveSecrets?: boolean;
}

export async function savePipelineConfig(
  state: PipelineConfigState,
  { unknownKeys = [], preserveSecrets = true }: SavePipelineConfigOptions = {},
): Promise<string> {
  const existingKnown = preserveSecrets
    ? (await withDb(async (client) => readPipelineConfigFromDb(client))).known
    : {};

  const entries: Record<string, string> = {};
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      const v = state[f.key];
      if (v === undefined) continue;
      if (f.type === 'tristate' && (v === 'auto' || v == null)) {
        entries[f.key] = 'auto';
      } else if (f.type === 'bool') {
        entries[f.key] = v === true ? 'true' : 'false';
      } else if (f.type === 'secret' || isPipelineSecretKey(f.key)) {
        const raw = v == null ? '' : String(v).trim();
        if (preserveSecrets && isMaskedSecretInput(raw, state, f.key) && existingKnown[f.key]) {
          entries[f.key] = existingKnown[f.key];
        } else if (raw && !raw.startsWith('••••')) {
          entries[f.key] = raw;
        } else {
          entries[f.key] = existingKnown[f.key] || '';
        }
      } else {
        entries[f.key] = v == null ? '' : String(v);
      }
    }
  }
  for (const key of INTERNAL_PIPELINE_KEYS) {
    const v = state[key];
    if (v == null || String(v).trim() === '') continue;
    entries[key] = String(v);
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await withDb(async (client: PoolClient) => {
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM pipeline_config');
      for (const [k, v] of Object.entries(entries)) {
        await client.query(
          'INSERT INTO pipeline_config (key, value, is_unknown, updated_at) VALUES ($1, $2, false, $3)',
          [k, v, now],
        );
      }
      for (const { key, value } of unknownKeys) {
        await client.query(
          `INSERT INTO pipeline_config (key, value, is_unknown, updated_at)
           VALUES ($1, $2, true, $3)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_unknown = true, updated_at = EXCLUDED.updated_at`,
          [key, value, now],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

  const shadowState: PipelineConfigState = { ...state };
  for (const key of Object.keys(entries)) {
    shadowState[key] = entries[key];
  }
  for (const key of Object.keys(shadowState)) {
    if (isPipelineHiddenKey(key)) {
      delete shadowState[key];
      delete shadowState[`${key}_masked`];
    }
  }
  writeShadowFile(shadowState, unknownKeys);
  return 'postgresql';
}
