/**
 * Thin server-side HTTP client for calling the FastAPI backend.
 * Used by server utilities that previously queried PostgreSQL directly.
 */

export function fastApiBase(): string {
  return (process.env.FASTAPI_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
}

export async function fastApiGet<T = unknown>(path: string): Promise<T> {
  const url = `${fastApiBase()}${path}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FastAPI GET ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fastApiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const url = `${fastApiBase()}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FastAPI POST ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fastApiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const url = `${fastApiBase()}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FastAPI PATCH ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fastApiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  const url = `${fastApiBase()}${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FastAPI PUT ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fastApiDelete<T = unknown>(path: string): Promise<T> {
  const url = `${fastApiBase()}${path}`;
  const res = await fetch(url, { method: 'DELETE', cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FastAPI DELETE ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
