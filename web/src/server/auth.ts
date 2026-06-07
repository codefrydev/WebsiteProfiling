import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'wp_session';
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

function sessionSecret(): string | null {
  const s = (process.env.AUTH_SECRET || process.env.SESSION_SECRET || '').trim();
  return s || null;
}

function signToken(payload: string): string {
  const secret = sessionSecret()!;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSessionToken(role: string = 'analyst'): string {
  const secret = sessionSecret();
  if (!secret) return '';
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S;
  const payload = `${role}:${exp}`;
  return `${payload}.${signToken(payload)}`;
}

export function verifySessionToken(token: string | null | undefined): { role: string } | null {
  if (!token || !sessionSecret()) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payload = parts[0];
  const sig = parts[1];
  const expected = signToken(payload);
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const [role, expStr] = payload.split(':');
  const exp = parseInt(expStr || '0', 10);
  if (!role || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return { role };
}

export function authEnabled(): boolean {
  return Boolean(sessionSecret());
}

const READONLY_ROLES = new Set(['viewer', 'client-readonly']);

export function sessionRoleFromRequest(request: NextRequest): string | null {
  if (!authEnabled()) return null;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySessionToken(cookie);
  return session?.role ?? null;
}

export function canMutateRole(role: string | null | undefined): boolean {
  if (!authEnabled()) return true;
  if (!role) return false;
  return !READONLY_ROLES.has(role);
}

export function defaultSessionRole(): string {
  const configured = (process.env.AUTH_DEFAULT_ROLE || 'analyst').trim();
  return configured || 'analyst';
}

export function requireApiAuth(request: NextRequest): NextResponse | null {
  if (!authEnabled()) return null;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySessionToken(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (session.role === 'viewer' || session.role === 'client-readonly') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // admin, editor, analyst may mutate
  return null;
}

/** Chat is read-only query — allow client-readonly; block unauthenticated viewer. */
export function requireApiAuthForChat(request: NextRequest): NextResponse | null {
  if (!authEnabled()) return null;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySessionToken(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (session.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export function requireAdmin(request: NextRequest): NextResponse | null {
  const base = requireApiAuth(request);
  if (base) return base;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySessionToken(cookie);
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }
  return null;
}

export function parseBasicAuth(request: NextRequest): boolean {
  const user = (process.env.AUTH_USER || 'admin').trim();
  const pass = (process.env.AUTH_PASSWORD || '').trim();
  if (!pass) return false;
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const [u, p] = decoded.split(':');
    return u === user && p === pass;
  } catch {
    return false;
  }
}
