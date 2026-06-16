import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { loadSecrets, saveSecrets } from '@/server/secrets';
import { ALL_SECRETS_KEYS } from '@/lib/secretsConfigSchema';
import type { ApiRouteHandler, SecretsPutBody, SecretsState } from '@/types/api';

export const runtime = 'nodejs';

/** GET /api/secrets — aggregated credentials (masked). */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  try {
    const result = await loadSecrets();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/** PUT /api/secrets — Body: { state: SecretsState } */
export const PUT: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: SecretsPutBody;
  try {
    body = (await request.json()) as SecretsPutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { state: rawState } = body;
  if (!rawState || typeof rawState !== 'object') {
    return NextResponse.json({ error: 'Missing state object' }, { status: 400 });
  }

  const state: SecretsState = {};
  for (const [key, rawValue] of Object.entries(rawState)) {
    if (!ALL_SECRETS_KEYS.has(key) && !key.endsWith('_masked') && key !== 'google_has_service_account') {
      continue;
    }
    if (key.endsWith('_masked') || key === 'google_has_service_account') {
      state[key] = rawValue === true;
      continue;
    }
    state[key] = rawValue == null ? '' : String(rawValue);
    if (rawState[`${key}_masked`] === true) {
      state[`${key}_masked`] = true;
    }
  }

  try {
    await saveSecrets(state);
    const result = await loadSecrets();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
