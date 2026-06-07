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
