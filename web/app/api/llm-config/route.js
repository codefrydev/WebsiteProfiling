import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { loadLlmConfig, saveLlmConfig } from '@/server/llmConfig';
import { ALL_LLM_SCHEMA_KEYS, getLlmFieldByKey } from '@/lib/llmConfigSchema';

export const runtime = 'nodejs';

/**
 * GET /api/llm-config — LLM settings from report.db only (secrets masked).
 */
export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  try {
    const result = await loadLlmConfig();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/llm-config — Body: { state: Record<string, string|boolean> }
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

  const { state: rawState } = body;
  if (!rawState || typeof rawState !== 'object') {
    return NextResponse.json({ error: 'Missing state object' }, { status: 400 });
  }

  const state = {};
  for (const [key, rawValue] of Object.entries(rawState)) {
    if (!ALL_LLM_SCHEMA_KEYS.has(key)) continue;
    if (key.endsWith('_masked')) continue;
    const field = getLlmFieldByKey(key);
    if (!field) continue;

    if (field.type === 'bool') {
      state[key] = rawValue === true || rawValue === 'true';
    } else {
      state[key] = rawValue == null ? '' : String(rawValue);
      if (rawState[`${key}_masked`] === true) {
        state[`${key}_masked`] = true;
      }
    }
  }

  try {
    const dbPath = await saveLlmConfig(state);
    return NextResponse.json({ ok: true, dbPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
