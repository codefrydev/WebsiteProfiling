import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { assertNoRunningJob, startPipelineJob } from '@/server/pipelineJobs';
import { requireApiAuth } from '@/server/auth';
import { writeAuditLog } from '@/server/pipelineJobsDb';
import { loadPipelineConfig, savePipelineConfig } from '@/server/pipelineConfig';
import { saveLlmConfig } from '@/server/llmConfig';
import { ALL_LLM_SCHEMA_KEYS, getLlmFieldByKey } from '@/lib/llmConfigSchema';
import {
  ALL_SCHEMA_KEYS,
  INTERNAL_PIPELINE_KEYS,
  getFieldByKey,
  validatePipelineRun,
} from '@/lib/pipelineConfigSchema';
import { resolvePropertyIdFromStartUrl } from '@/server/propertiesDb';
import type {
  ApiRouteHandler,
  LlmConfigState,
  PipelineConfigState,
  PipelineUnknownKey,
  RunPostBody,
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
 * POST /api/run
 * Body: { command?: string, state: Record<string, string|boolean>,
 *         unknownKeys?: Array<{key,value}>, python?: string, repoRoot?: string }
 *
 * Saves state to PostgreSQL (pipeline_config table) + shadow pipeline-config.txt,
 * then spawns `python -m src` (Python reads config via DATABASE_URL).
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: RunPostBody;
  try {
    body = (await request.json().catch(() => ({}))) as RunPostBody;
  } catch {
    body = {};
  }

  const { command = null, state: rawState, unknownKeys = [], llmState: rawLlmState, python, repoRoot } = body;

  let resolvedState = rawState;
  let resolvedUnknownKeys = unknownKeys;

  if (!resolvedState || typeof resolvedState !== 'object') {
    // Integrations "Fetch data now" and similar callers may omit state — use saved config.
    try {
      const loaded = await loadPipelineConfig();
      resolvedState = loaded.state;
      resolvedUnknownKeys = loaded.unknownKeys;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Missing state object and could not load config: ${msg}` }, { status: 400 });
    }
  }

  if (!resolvedState || typeof resolvedState !== 'object') {
    return NextResponse.json({ error: 'Missing state object' }, { status: 400 });
  }

  const internalKeySet = new Set<string>(INTERNAL_PIPELINE_KEYS);

  // Coerce state per field type
  const state: PipelineConfigState = {};
  for (const [key, rawValue] of Object.entries(resolvedState)) {
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
  let resolvedPropertyId: number | null =
    body.propertyId != null && Number.isFinite(body.propertyId) ? body.propertyId : null;
  if (startUrl) {
    resolvedPropertyId = await resolvePropertyIdFromStartUrl(startUrl);
    state.active_property_id = String(resolvedPropertyId);
  }

  const safeUnknownKeys: PipelineUnknownKey[] = Array.isArray(resolvedUnknownKeys)
    ? resolvedUnknownKeys.filter(
        (u) =>
          isUnknownKeyEntry(u) &&
          !u.key.startsWith('llm_') &&
          !u.key.startsWith('ml_'),
      )
    : [];

  const validationErrors = validatePipelineRun({ state, command: command || null });
  if (validationErrors.length > 0) {
    return NextResponse.json({ error: validationErrors.join(' ') }, { status: 400 });
  }

  try {
    await savePipelineConfig(state, { unknownKeys: safeUnknownKeys });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to save config: ${msg}` }, { status: 500 });
  }

  if (rawLlmState && typeof rawLlmState === 'object') {
    const llmCoerced: LlmConfigState = {};
    for (const [key, rawValue] of Object.entries(rawLlmState)) {
      if (!ALL_LLM_SCHEMA_KEYS.has(key)) continue;
      if (key.endsWith('_masked')) continue;
      const field = getLlmFieldByKey(key);
      if (!field) continue;
      if (field.type === 'bool') {
        llmCoerced[key] = rawValue === true || rawValue === 'true';
      } else {
        llmCoerced[key] = rawValue == null ? '' : String(rawValue);
        if (rawLlmState[`${key}_masked`] === true) {
          llmCoerced[`${key}_masked`] = true;
        }
      }
    }
    try {
      await saveLlmConfig(llmCoerced);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Failed to save LLM config: ${msg}` }, { status: 500 });
    }
  }

  try {
    await assertNoRunningJob();
    const id = startPipelineJob(command ?? null, null, {
      python,
      repoRoot,
      propertyId: resolvedPropertyId,
    });
    void writeAuditLog('audit_run_started', null, resolvedPropertyId, {
      command: command ?? null,
      jobId: id,
    }).catch(() => {});
    return NextResponse.json({ jobId: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
};
