/**
 * Thin proxy helper: forwards a Next.js API request to the FastAPI backend.
 *
 * - Forwards method, full query string, body, and Content-Type.
 * - Streams the response body (required for SSE chat and large exports).
 * - Preserves the upstream Content-Type response header.
 * - Does NOT forward cookies to FastAPI (auth is enforced in Next.js before calling this).
 */
import type { NextRequest } from 'next/server';

const FASTAPI_BASE = (process.env.FASTAPI_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');

export async function proxyToFastAPI(req: NextRequest, path: string): Promise<Response> {
  const url = `${FASTAPI_BASE}${path}${req.nextUrl.search}`;

  const upstream = await fetch(url, {
    method: req.method,
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
    },
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    // Node 18+ fetch requires duplex:'half' for streaming request bodies.
    // @ts-expect-error — not in all TS lib versions
    duplex: 'half',
  });

  // Forward the upstream Content-Type so SSE streams and JSON are handled correctly.
  const contentType = upstream.headers.get('content-type') ?? 'application/json';

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': contentType,
    },
  });
}
