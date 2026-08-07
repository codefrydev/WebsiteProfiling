import { pathSlugToViewId } from '@/routes';

const STORAGE_KEY = 'chat:last-context:v1';
const DRAFT_STORAGE_KEY = 'chat:composer-draft:v1';

export interface ChatComposerDraft {
  domain?: string;
  text: string;
}

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

export function writeChatComposerDraft(draft: ChatComposerDraft): void {
  if (typeof window === 'undefined') return;
  const text = String(draft.text || '').trim();
  if (!text) return;
  try {
    sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        domain: draft.domain ? String(draft.domain).trim() : undefined,
        text,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function readChatComposerDraft(domain?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ChatComposerDraft;
    const text = String(data.text || '').trim();
    if (!text) return null;
    const storedDomain = String(data.domain || '').trim().toLowerCase();
    const expected = String(domain || '').trim().toLowerCase();
    if (storedDomain && expected && storedDomain !== expected) return null;
    return text;
  } catch {
    return null;
  }
}

export function clearChatComposerDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
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

/** Report views that carry ?domain= (not home, chat, pipeline, or write). */
export function isChatFabVisiblePath(pathname: string): boolean {
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return false;
  if (pathname === '/pipeline' || pathname.startsWith('/pipeline/')) return false;
  if (pathname === '/write' || pathname.startsWith('/write/')) return false;
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

/** Session id to open after refresh: URL → stored (same property) → most recent in list. */
export function resolvePreferredChatSession(
  propertyId: number,
  urlCtx: ChatUrlContext,
  stored: ChatUrlContext,
  sessions: ReadonlyArray<{ id: number }>,
): number | null {
  if (urlCtx.sessionId) return urlCtx.sessionId;
  if (stored.propertyId === propertyId) {
    if (stored.sessionId) return stored.sessionId;
    return null;
  }
  return sessions[0]?.id ?? null;
}

export function readSessionPropertyId(session: {
  propertyId?: unknown;
  property_id?: unknown;
}): number | null {
  const raw = session.propertyId ?? session.property_id;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeSessionId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

export function sessionIdsEqual(a: unknown, b: unknown): boolean {
  const na = normalizeSessionId(a);
  const nb = normalizeSessionId(b);
  return na != null && nb != null && na === nb;
}

export interface ChatSessionRow {
  id: number;
  propertyId: number;
  title: string;
}

export function normalizeChatSessionRow(raw: {
  id?: unknown;
  propertyId?: unknown;
  property_id?: unknown;
  title?: unknown;
}): ChatSessionRow | null {
  const id = normalizeSessionId(raw.id);
  const propertyId = readSessionPropertyId(raw);
  if (id == null || propertyId == null) return null;
  const title = String(raw.title ?? '').trim() || 'New chat';
  return { id, propertyId, title };
}

export function upsertChatSession(
  sessions: ReadonlyArray<ChatSessionRow>,
  session: ChatSessionRow,
): ChatSessionRow[] {
  const rest = sessions.filter((s) => !sessionIdsEqual(s.id, session.id));
  return [session, ...rest];
}
