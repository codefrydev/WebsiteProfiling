import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

function makeChildProcess(stdout: string, exitCode: number) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  setTimeout(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  }, 10);
  return proc;
}

function localRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers: { host: 'localhost:3000' } });
}

describe('GET /api/crawl/browser-status', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
  });

  it('returns ok when Python reports browser available', async () => {
    spawnMock.mockImplementation(() => makeChildProcess('{"ok": true}\n', 0));
    const { GET } = await import('../../app/api/crawl/browser-status/route');
    const res = await GET(localRequest('/api/crawl/browser-status'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns not ok when Python exits non-zero', async () => {
    spawnMock.mockImplementation(() => makeChildProcess('playwright missing\n', 1));
    const { GET } = await import('../../app/api/crawl/browser-status/route');
    const res = await GET(localRequest('/api/crawl/browser-status'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.message || '')).toMatch(/playwright|JavaScript crawl/i);
  });

  it('rejects non-local hosts', async () => {
    const { GET } = await import('../../app/api/crawl/browser-status/route');
    const res = await GET(new NextRequest('http://192.168.1.5:3000/api/crawl/browser-status'));
    expect(res.status).toBe(403);
  });
});
