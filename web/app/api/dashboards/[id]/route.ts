import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getDashboard, updateDashboard, deleteDashboard } from '@/server/dashboardsDb';
import type { ApiRouteHandlerWithParams } from '@/types/api';
import type { DashboardDoc } from '@/types/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

/**
 * GET /api/dashboards/[id]?propertyId=<n>
 * Returns a single dashboard.
 */
export const GET: ApiRouteHandlerWithParams<Params> = async (
  request: NextRequest,
  { params },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const { id } = await params;
  const dashboardId = Number(id);
  const propertyId = Number(new URL(request.url).searchParams.get('propertyId') || 0);

  if (!dashboardId || !propertyId) {
    return NextResponse.json({ error: 'id and propertyId required' }, { status: 400 });
  }

  try {
    const dashboard = await getDashboard(dashboardId, propertyId);
    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ dashboard });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/**
 * PUT /api/dashboards/[id]
 * Body: { propertyId, name?, layoutJson?, isDefault? }
 * Partial update — only provided fields are changed.
 */
export const PUT: ApiRouteHandlerWithParams<Params> = async (
  request: NextRequest,
  { params },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const { id } = await params;
  const dashboardId = Number(id);

  let body: { propertyId?: number; name?: string; layoutJson?: DashboardDoc; isDefault?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const propertyId = Number(body.propertyId || 0);
  if (!dashboardId || !propertyId) {
    return NextResponse.json({ error: 'id and propertyId required' }, { status: 400 });
  }

  try {
    const dashboard = await updateDashboard(dashboardId, propertyId, {
      name: body.name,
      layoutJson: body.layoutJson,
      isDefault: body.isDefault,
    });
    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ dashboard });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/**
 * DELETE /api/dashboards/[id]?propertyId=<n>
 */
export const DELETE: ApiRouteHandlerWithParams<Params> = async (
  request: NextRequest,
  { params },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const { id } = await params;
  const dashboardId = Number(id);
  const propertyId = Number(new URL(request.url).searchParams.get('propertyId') || 0);

  if (!dashboardId || !propertyId) {
    return NextResponse.json({ error: 'id and propertyId required' }, { status: 400 });
  }

  try {
    const deleted = await deleteDashboard(dashboardId, propertyId);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
