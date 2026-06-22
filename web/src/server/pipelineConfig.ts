/**
 * Pipeline config — reads and writes via FastAPI (/api/pipeline-config).
 * A shadow `pipeline-config.txt` is written to DATA_DIR on every Save/Run for CLI back-compat.
 */
import fs from 'fs';
import path from 'path';
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
import { fastApiGet, fastApiPut } from '@/server/fastApiClient';
import type {
  PipelineConfigLoadResult,
  PipelineConfigState,
  PipelineUnknownKey,
} from '@/types/api';

function getDataDir(): string {
  return process.env.WP_DATA_DIR || process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
}

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

async function readPipelineConfigFromApi(): Promise<{
  known: Record<string, string>;
  unknown: PipelineUnknownKey[];
}> {
  const known: Record<string, string> = {};
  const unknown: PipelineUnknownKey[] = [];
  try {
    const data = await fastApiGet<{ state?: Record<string, unknown>; unknownKeys?: PipelineUnknownKey[] }>('/api/pipeline-config');
    const state = data.state ?? {};
    for (const [k, v] of Object.entries(state)) {
      if (v != null) known[k] = String(v);
    }
    for (const u of data.unknownKeys ?? []) {
      unknown.push(u);
    }
  } catch {
    /* FastAPI unavailable */
  }
  return { known, unknown };
}

async function loadPipelineConfigInternal(mask: boolean): Promise<PipelineConfigLoadResult> {
  const { known, unknown } = await readPipelineConfigFromApi();
  const maybeMask = (state: PipelineConfigState) =>
    mask ? maskPipelineSecretsForClient(state) : state;

  if (Object.keys(known).length > 0 || unknown.length > 0) {
    const { state, unknownKeys: schemaUnknown } = applySchemaDefaultsRaw(known);
    const allUnknown = filterUnknownKeys([...unknown, ...schemaUnknown]);
    return { state: maybeMask(state), unknownKeys: allUnknown, source: 'store' };
  }

  const shadowPath = getShadowConfigPath();
  if (fs.existsSync(shadowPath)) {
    try {
      const raw = fs.readFileSync(shadowPath, 'utf8');
      const parsed = parseInputTxt(raw);
      if (Object.keys(parsed).length > 0) {
        const { state, unknownKeys } = applySchemaDefaultsRaw(parsed);
        return { state: maybeMask(state), unknownKeys: filterUnknownKeys(unknownKeys), source: 'legacy' };
      }
    } catch {
      /* fall through */
    }
  }

  return { state: buildDefaults(), unknownKeys: [], source: 'defaults' };
}

/** Returns pipeline config with secrets MASKED — safe to send to the client. */
export async function loadPipelineConfig(): Promise<PipelineConfigLoadResult> {
  return loadPipelineConfigInternal(true);
}

/**
 * Server-only variant that returns UNMASKED secrets. Never return its result to
 * the client — it contains raw API keys/tokens. Use only when a server route must
 * consume a secret in-process (e.g. authenticating a spawned Python subprocess).
 */
export async function loadPipelineConfigUnmasked(): Promise<PipelineConfigLoadResult> {
  return loadPipelineConfigInternal(false);
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
    ? (await readPipelineConfigFromApi()).known
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

  await fastApiPut('/api/pipeline-config', { state: entries, unknownKeys });

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
