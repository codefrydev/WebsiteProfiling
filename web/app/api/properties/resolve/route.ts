import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import {
  canonicalDomainFromStartUrl,
  getPropertyByDomain,
  resolvePropertyIdFromStartUrl,
} from '@/server/propertiesDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/properties/resolve?startUrl=... — upsert property row and return id. */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const startUrl = request.nextUrl.searchParams.get('startUrl')?.trim() || '';
  if (!startUrl) {
    return NextResponse.json({ error: 'startUrl required' }, { status: 400 });
  }
  try {
    const id = await resolvePropertyIdFromStartUrl(startUrl);
    const domain = canonicalDomainFromStartUrl(startUrl);
    const property = domain ? await getPropertyByDomain(domain) : null;
    return NextResponse.json({
      id,
      canonical_domain: domain,
      default_crawl_preset: property?.default_crawl_preset ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
