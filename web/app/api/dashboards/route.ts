import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import {
  listDashboards,
  createDashboard,
} from '@/server/dashboardsDb';
import { emptyDashboard } from '@/types/dashboard';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards?propertyId=<n>
 * Returns all dashboards for a property ordered by updated_at DESC.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const propertyId = Number(new URL(request.url).searchParams.get('propertyId') || 0);
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  try {
    const dashboards = await listDashboards(propertyId);
    return NextResponse.json({ dashboards });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/**
 * POST /api/dashboards
 * Body: { propertyId, name?, layoutJson? }
 * Creates a new dashboard and returns it.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: { propertyId?: number; name?: string; layoutJson?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const propertyId = Number(body.propertyId || 0);
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  const name = String(body.name || 'Untitled dashboard').trim() || 'Untitled dashboard';

  try {
    const dashboard = await createDashboard(
      propertyId,
      name,
      (body.layoutJson as ReturnType<typeof emptyDashboard>) ?? emptyDashboard(),
    );
    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
