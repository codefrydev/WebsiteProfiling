import { pathSlugToViewId } from '@/routes';

const STORAGE_KEY = 'chat:last-context:v1';

export interface ChatUrlContext {
  propertyId: number | null;
  sessionId: number | null;
}

export function parseChatUrlContext(searchParams: URLSearchParams): ChatUrlContext {
  const propertyRaw = searchParams.get('property') ?? searchParams.get('propertyId');
  const sessionRaw = searchParams.get('session') ?? searchParams.get('sessionId');
  const propertyId = propertyRaw ? Number(propertyRaw) : NaN;
  const sessionId = sessionRaw ? Number(sessionRaw) : NaN;
  return {
    propertyId: Number.isFinite(propertyId) && propertyId > 0 ? propertyId : null,
    sessionId: Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null,
  };
}

export function readStoredChatContext(): ChatUrlContext {
  if (typeof window === 'undefined') return { propertyId: null, sessionId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { propertyId: null, sessionId: null };
    const data = JSON.parse(raw) as { propertyId?: unknown; sessionId?: unknown };
    const propertyId = Number(data.propertyId);
    const sessionId = Number(data.sessionId);
    return {
      propertyId: Number.isFinite(propertyId) && propertyId > 0 ? propertyId : null,
      sessionId: Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null,
    };
  } catch {
    return { propertyId: null, sessionId: null };
  }
}

export function writeStoredChatContext(ctx: ChatUrlContext): void {
  if (typeof window === 'undefined' || !ctx.propertyId) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ propertyId: ctx.propertyId, sessionId: ctx.sessionId }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function buildChatSearchQuery(
  current: URLSearchParams | string,
  ctx: ChatUrlContext,
): string {
  const params = new URLSearchParams(
    typeof current === 'string' ? current : current.toString(),
  );
  applyChatUrlContext(params, ctx);
  return params.toString();
}

/** Report views that carry ?domain= (not home, chat, or pipeline). */
export function isChatFabVisiblePath(pathname: string): boolean {
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return false;
  if (pathname === '/pipeline' || pathname.startsWith('/pipeline/')) return false;
  if (pathname === '/home') return false;
  const slug = pathname.replace(/^\//, '').split('/')[0] ?? '';
  const viewId = pathSlugToViewId(slug);
  return viewId != null && viewId !== 'home';
}

/** Deep link into chat scoped to the current site domain. */
export function buildChatFabHref(domain: string | null | undefined): string {
  const trimmed = (domain ?? '').trim();
  if (!trimmed) return '/chat';
  const params = new URLSearchParams();
  params.set('domain', trimmed);
  return `/chat?${params.toString()}`;
}

export function applyChatUrlContext(
  params: URLSearchParams,
  ctx: ChatUrlContext,
): void {
  if (ctx.propertyId) {
    params.set('property', String(ctx.propertyId));
    params.delete('propertyId');
  } else {
    params.delete('property');
    params.delete('propertyId');
  }
  if (ctx.sessionId) {
    params.set('session', String(ctx.sessionId));
    params.delete('sessionId');
  } else {
    params.delete('session');
    params.delete('sessionId');
  }
}
