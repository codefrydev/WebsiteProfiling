import { NextResponse } from 'next/server';
import { startPipelineJob } from '@/server/pipelineJobs';
import { loadPipelineConfig, savePipelineConfig } from '@/server/pipelineConfig';
import { ALL_SCHEMA_KEYS, getFieldByKey, validatePipelineRun } from '@/lib/pipelineConfigSchema';

export const runtime = 'nodejs';

function forbiddenIfNotLocal(request) {
  const host = (request.headers.get('host') || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return NextResponse.json({ error: 'Only available on localhost' }, { status: 403 });
  }
  return null;
}

/**
 * POST /api/run
 * Body: { command?: string, state: Record<string, string|boolean>,
 *         unknownKeys?: Array<{key,value}>, python?: string, repoRoot?: string }
 *
 * Saves state to report.db (pipeline_config table) + shadow pipeline-config.txt,
 * then spawns `python -m src` (Python reads config from DB via REPORT_DB_PATH).
 */
export async function POST(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const { command = null, state: rawState, unknownKeys = [], python, repoRoot } = body;

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

  // Coerce state per field type
  const state = {};
  for (const [key, rawValue] of Object.entries(resolvedState)) {
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

  const safeUnknownKeys = Array.isArray(resolvedUnknownKeys)
    ? resolvedUnknownKeys.filter((u) => u && typeof u.key === 'string' && typeof u.value === 'string')
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

  try {
    // No config path needed — Python reads from DB via REPORT_DB_PATH env.
    const id = startPipelineJob(command, null, { python, repoRoot });
    return NextResponse.json({ jobId: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
