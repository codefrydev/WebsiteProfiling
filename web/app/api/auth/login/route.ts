import { NextResponse, type NextRequest } from 'next/server';
import {
  authEnabled,
  createSessionToken,
  parseBasicAuth,
} from '@/server/auth';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  if (!authEnabled()) {
    return NextResponse.json({ ok: true, auth: 'disabled' });
  }
  if (!parseBasicAuth(request)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const token = createSessionToken('analyst');
  const res = NextResponse.json({ ok: true });
  res.cookies.set('wp_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
};
