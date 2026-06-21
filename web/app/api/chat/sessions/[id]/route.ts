import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth, requireApiAuthForChat } from '@/server/auth';
import { deleteChatSession, getChatSession } from '@/server/chatDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/chat/sessions/[id] */
export const GET: ApiRouteHandler = async (
  request: NextRequest,
  context?: { params?: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuthForChat(request);
  if (authDenied) return authDenied;

  const params = context?.params ? await context.params : { id: '' };
  const sessionId = Number(params.id || '0');
  if (!sessionId) {
    return NextResponse.json({ error: 'invalid session id' }, { status: 400 });
  }

  try {
    const session = await getChatSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/** DELETE /api/chat/sessions/[id]?propertyId= */
export const DELETE: ApiRouteHandler = async (
  request: NextRequest,
  context?: { params?: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  // Deleting a session is a destructive mutation: require a non-read-only role.
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  const params = context?.params ? await context.params : { id: '' };
  const sessionId = Number(params.id || '0');
  if (!sessionId) {
    return NextResponse.json({ error: 'invalid session id' }, { status: 400 });
  }
  const propertyId = Number(request.nextUrl.searchParams.get('propertyId') || '0');
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  try {
    // Scope the delete to the caller's property (consistent with POST /api/chat).
    const session = await getChatSession(sessionId);
    if (!session || session.property_id !== propertyId) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }
    const deleted = await deleteChatSession(sessionId);
    if (!deleted) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
