import { NextResponse } from 'next/server';

/**
 * Returns a 403 NextResponse if the request is not from localhost, otherwise null.
 * Use at the top of every API route handler that should only be accessible locally.
 */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function forbiddenIfNotLocal(request) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    return NextResponse.json(
      { error: 'Google setup and pipeline APIs require http://localhost:3000 (not an IP or custom hostname).' },
      { status: 403 }
    );
  }
  return null;
}
