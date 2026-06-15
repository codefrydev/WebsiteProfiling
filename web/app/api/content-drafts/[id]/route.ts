import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import {
  deleteContentDraft,
  getContentDraft,
  updateContentDraft,
  type UpdateContentDraftInput,
} from '@/server/contentDraftDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/content-drafts/[id] */
export const GET: ApiRouteHandler = async (
  request: NextRequest,
  context?: { params?: Promise<{ id: string }> },
): Promise<Response> => {
  const params = context?.params ? await context.params : { id: '' };
  const draftId = Number(params.id || '0');
  if (!draftId) {
    return NextResponse.json({ error: 'invalid draft id' }, { status: 400 });
  }

  try {
    const draft = await getContentDraft(draftId);
    if (!draft) {
      return NextResponse.json({ error: 'draft not found' }, { status: 404 });
    }
    return NextResponse.json({ draft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/** PATCH /api/content-drafts/[id] */
export const PATCH: ApiRouteHandler = async (
  request: NextRequest,
  context?: { params?: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  const params = context?.params ? await context.params : { id: '' };
  const draftId = Number(params.id || '0');
  if (!draftId) {
    return NextResponse.json({ error: 'invalid draft id' }, { status: 400 });
  }

  let body: UpdateContentDraftInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const existing = await getContentDraft(draftId);
    if (!existing) {
      return NextResponse.json({ error: 'draft not found' }, { status: 404 });
    }
    const draft = await updateContentDraft(draftId, body);
    return NextResponse.json({ draft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/** DELETE /api/content-drafts/[id] */
export const DELETE: ApiRouteHandler = async (
  request: NextRequest,
  context?: { params?: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  const params = context?.params ? await context.params : { id: '' };
  const draftId = Number(params.id || '0');
  if (!draftId) {
    return NextResponse.json({ error: 'invalid draft id' }, { status: 400 });
  }

  try {
    const ok = await deleteContentDraft(draftId);
    if (!ok) {
      return NextResponse.json({ error: 'draft not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
