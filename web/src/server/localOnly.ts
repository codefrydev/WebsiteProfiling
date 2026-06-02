import { NextResponse, type NextRequest } from 'next/server';
import type { LocalGuardResult } from '@/types/api';

/**
 * Returns a 403 NextResponse if the request is not from localhost, otherwise null.
 * Use at the top of every API route handler that should only be accessible locally.
 */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function hostFromHeader(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (!h) return '';
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end > 1) return h.slice(1, end);
  }
  return h.split(':')[0];
}

export function forbiddenIfNotLocal(request: NextRequest): LocalGuardResult {
  const host = hostFromHeader(request.headers.get('host') || '');
  if (!LOCAL_HOSTS.has(host)) {
    return NextResponse.json(
      {
        error:
          'Google setup and pipeline APIs require http://localhost:3000 (not an IP or custom hostname).',
      },
      { status: 403 },
    );
  }
  return null;
}
