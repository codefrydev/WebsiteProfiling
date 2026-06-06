import { vi } from 'vitest';
import { NextRequest } from 'next/server';
import { EventEmitter } from 'events';

export function localRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    ...init,
    headers: { host: 'localhost:3000', ...(init?.headers || {}) },
  });
}

export function remoteRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://192.168.1.5:3000${path}`, init);
}

export function makeSpawnChild(stdout: string, exitCode: number) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.kill = vi.fn();
  setTimeout(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  }, 10);
  return proc;
}

export function withAuthSecret(secret = 'test-secret-for-vitest') {
  const prev = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = secret;
  return () => {
    if (prev === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prev;
  };
}

export async function sessionCookie(role = 'analyst'): Promise<string> {
  const { createSessionToken } = await import('@/server/auth');
  return `wp_session=${createSessionToken(role)}`;
}

export function authHeaders(role = 'analyst'): Promise<Record<string, string>> {
  return sessionCookie(role).then((cookie) => ({ Cookie: cookie }));
}
