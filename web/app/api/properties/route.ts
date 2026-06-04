import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { listProperties, upsertPropertyByDomain } from '@/server/propertiesDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  try {
    const rows = await listProperties();
    return NextResponse.json({ properties: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  let body: { name?: string; canonical_domain?: string; site_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const name = String(body.name || '').trim();
  const domain = String(body.canonical_domain || '').trim().toLowerCase();
  if (!name || !domain) {
    return NextResponse.json({ error: 'name and canonical_domain required' }, { status: 400 });
  }
  try {
    const id = await upsertPropertyByDomain(name, domain, body.site_url?.trim() || null);
    return NextResponse.json({ id, name, canonical_domain: domain });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
