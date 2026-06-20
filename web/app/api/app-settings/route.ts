import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { loadAppSetting, saveAppSetting } from '@/server/appSettings';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

/** GET /api/app-settings?key=<key> — Returns { key, value } or { key, value: null }. */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const key = request.nextUrl.searchParams.get('key');
  if (!key || typeof key !== 'string' || key.trim() === '') {
    return NextResponse.json({ error: 'Missing key query parameter' }, { status: 400 });
  }

  try {
    const value = await loadAppSetting(key.trim());
    return NextResponse.json({ key: key.trim(), value });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/** PUT /api/app-settings — Body: { key: string; value: string } */
export const PUT: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).key !== 'string' ||
    typeof (body as Record<string, unknown>).value !== 'string'
  ) {
    return NextResponse.json({ error: 'Body must be { key: string; value: string }' }, { status: 400 });
  }

  const { key, value } = body as { key: string; value: string };

  if (key.trim() === '') {
    return NextResponse.json({ error: 'key must not be empty' }, { status: 400 });
  }

  try {
    await saveAppSetting(key.trim(), value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
