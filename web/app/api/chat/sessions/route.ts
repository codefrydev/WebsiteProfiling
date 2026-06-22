import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuthForChat } from '@/server/auth';
import { createChatSession, listChatSessions } from '@/server/chatDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/chat/sessions?propertyId= — list chat sessions for a property. */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuthForChat(request);
  if (authDenied) return authDenied;

  const propertyId = Number(request.nextUrl.searchParams.get('propertyId') || '0');
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  try {
    const sessions = await listChatSessions(propertyId);
    return NextResponse.json({ sessions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/** POST /api/chat/sessions — create session { propertyId, title? }. */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  // Chat (incl. starting a session) is intentionally available to the
  // read-only client role; only destructive deletes are restricted (see DELETE).
  const authDenied = requireApiAuthForChat(request);
  if (authDenied) return authDenied;

  let body: { propertyId?: number; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const propertyId = Number(body.propertyId || 0);
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  try {
    const id = await createChatSession(propertyId, body.title);
    return NextResponse.json({ id, propertyId, title: body.title?.trim() || 'New chat' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
