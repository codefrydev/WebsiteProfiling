import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { loadPipelineConfig, savePipelineConfig } from '@/server/pipelineConfig';
import {
  ALL_SCHEMA_KEYS,
  INTERNAL_PIPELINE_KEYS,
  getFieldByKey,
  validateRequiredPipelineFields,
} from '@/lib/pipelineConfigSchema';
import { resolvePropertyIdFromStartUrl } from '@/server/propertiesDb';
import type {
  ApiRouteHandler,
  PipelineConfigPutBody,
  PipelineConfigState,
  PipelineUnknownKey,
} from '@/types/api';

export const runtime = 'nodejs';

function isUnknownKeyEntry(value: unknown): value is PipelineUnknownKey {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as PipelineUnknownKey).key === 'string' &&
    typeof (value as PipelineUnknownKey).value === 'string'
  );
}

/**
 * GET /api/pipeline-config
 * Returns { state, unknownKeys, source, dbPath }.
 * Localhost-only.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  try {
    const result = await loadPipelineConfig();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/**
 * PUT /api/pipeline-config
 * Body: { state: Record<string, string|boolean>, unknownKeys?: Array<{key,value}> }
 */
export const PUT: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: PipelineConfigPutBody;
  try {
    body = (await request.json()) as PipelineConfigPutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { state: rawState, unknownKeys = [] } = body;
  if (!rawState || typeof rawState !== 'object') {
    return NextResponse.json({ error: 'Missing state object' }, { status: 400 });
  }

  const internalKeySet = new Set<string>(INTERNAL_PIPELINE_KEYS);
  const state: PipelineConfigState = {};
  for (const [key, rawValue] of Object.entries(rawState)) {
    if (key.startsWith('llm_')) continue;
    if (!ALL_SCHEMA_KEYS.has(key)) continue;
    const field = getFieldByKey(key);
    if (field) {
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
      continue;
    }
    if (internalKeySet.has(key)) {
      state[key] = rawValue == null ? '' : String(rawValue);
    }
  }

  const startUrl = String(state.start_url || '').trim();
  if (startUrl) {
    const resolvedPropertyId = await resolvePropertyIdFromStartUrl(startUrl);
    state.active_property_id = String(resolvedPropertyId);
  }

  const safeUnknownKeys: PipelineUnknownKey[] = Array.isArray(unknownKeys)
    ? unknownKeys.filter(
        (u) =>
          isUnknownKeyEntry(u) &&
          !u.key.startsWith('llm_') &&
          !u.key.startsWith('ml_'),
      )
    : [];

  const requiredErrors = validateRequiredPipelineFields(state);
  if (requiredErrors.length > 0) {
    return NextResponse.json({ error: requiredErrors.join(' ') }, { status: 400 });
  }

  try {
    const configPath = await savePipelineConfig(state, { unknownKeys: safeUnknownKeys });
    return NextResponse.json({ ok: true, configPath, source: 'store' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
