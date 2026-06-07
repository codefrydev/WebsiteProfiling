import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuthForChat } from '@/server/auth';
import { getChatMessages } from '@/server/chatDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/chat/sessions/[id]/messages */
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
    const messages = await getChatMessages(sessionId);
    return NextResponse.json({ messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
