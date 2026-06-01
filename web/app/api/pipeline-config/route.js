import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { loadPipelineConfig, savePipelineConfig } from '@/server/pipelineConfig';
import { ALL_SCHEMA_KEYS, getFieldByKey } from '@/lib/pipelineConfigSchema';

export const runtime = 'nodejs';

/**
 * GET /api/pipeline-config
 * Returns { state, unknownKeys, source, dbPath }.
 * Localhost-only.
 */
export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  try {
    const result = await loadPipelineConfig();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/pipeline-config
 * Body: { state: Record<string, string|boolean>, unknownKeys?: Array<{key,value}> }
 * Validates + coerces per field type, saves to report.db pipeline_config table
 * and writes shadow pipeline-config.txt.
 * Returns { ok: true, dbPath }.
 * Localhost-only.
 */
export async function PUT(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { state: rawState, unknownKeys = [] } = body;
  if (!rawState || typeof rawState !== 'object') {
    return NextResponse.json({ error: 'Missing state object' }, { status: 400 });
  }

  // Coerce each key to its declared type; ignore keys not in schema.
  // LLM keys are UI-only (llm_config table) — never persist via pipeline-config.
  const state = {};
  for (const [key, rawValue] of Object.entries(rawState)) {
    if (key.startsWith('llm_')) continue;
    if (!ALL_SCHEMA_KEYS.has(key)) continue;
    const field = getFieldByKey(key);
    if (!field) continue;

    if (field.type === 'bool') {
      state[key] = rawValue === true || rawValue === 'true';
    } else if (field.type === 'tristate') {
      const s = String(rawValue ?? 'auto').toLowerCase();
      if (s === 'true') state[key] = 'true';
      else if (s === 'false') state[key] = 'false';
      else state[key] = 'auto';
    } else {
      state[key] = rawValue == null ? '' : String(rawValue);
    }
  }

  // Validate unknownKeys shape; drop llm_* (UI-only) and legacy ml_* keys
  const safeUnknownKeys = Array.isArray(unknownKeys)
    ? unknownKeys.filter(
        (u) =>
          u &&
          typeof u.key === 'string' &&
          typeof u.value === 'string' &&
          !u.key.startsWith('llm_') &&
          !u.key.startsWith('ml_'),
      )
    : [];

  try {
    const dbPath = await savePipelineConfig(state, { unknownKeys: safeUnknownKeys });
    return NextResponse.json({ ok: true, dbPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
