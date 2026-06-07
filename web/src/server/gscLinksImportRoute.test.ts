import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { EventEmitter } from 'events';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
const getPropertyByIdMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock('@/server/propertiesDb', () => ({
  getPropertyById: (...args: unknown[]) => getPropertyByIdMock(...args),
}));

function makeChildProcess(stdout: string, exitCode: number) {
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

async function importRoute() {
  return import('../../app/api/properties/[id]/google/links/import/route');
}

describe('POST /api/properties/[id]/google/links/import', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    getPropertyByIdMock.mockReset();
    vi.resetModules();
    getPropertyByIdMock.mockResolvedValue({ id: 1, name: 'Test', domain: 'example.com' });
  });

  it('returns 403 for non-local hosts', async () => {
    const { POST } = await importRoute();
    const res = await POST(
      new NextRequest('http://192.168.1.5:3000/api/properties/1/google/links/import', {
        method: 'POST',
        body: JSON.stringify({ fileContent: 'Site,Links\na.com,1\n' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when property not found', async () => {
    getPropertyByIdMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(
      localRequest('/api/properties/99/google/links/import', {
        method: 'POST',
        body: JSON.stringify({ fileContent: 'Site,Links\na.com,1\n' }),
      }),
      { params: Promise.resolve({ id: '99' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when fileContent is empty', async () => {
    const { POST } = await importRoute();
    const res = await POST(
      localRequest('/api/properties/1/google/links/import', {
        method: 'POST',
        body: JSON.stringify({ fileContent: '   ' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/fileContent/i);
  });

  it('returns 200 when Python import succeeds', async () => {
    spawnMock.mockImplementation(() =>
      makeChildProcess(JSON.stringify({ ok: true, export_types: ['top_linking_sites'] }) + '\n', 0),
    );
    const { POST } = await importRoute();
    const res = await POST(
      localRequest('/api/properties/1/google/links/import', {
        method: 'POST',
        body: JSON.stringify({
          fileContent: 'Site,Links,Target pages\nexample.com,5,2\n',
          fileName: 'sites.csv',
        }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 400 when Python reports failure', async () => {
    spawnMock.mockImplementation(() =>
      makeChildProcess(JSON.stringify({ ok: false, error: 'Invalid CSV' }) + '\n', 1),
    );
    const { POST } = await importRoute();
    const res = await POST(
      localRequest('/api/properties/1/google/links/import', {
        method: 'POST',
        body: JSON.stringify({ fileContent: 'bad\n' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid CSV/i);
  });
});
