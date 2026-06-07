import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPropertyById, setPropertyOpsSettings } from '@/server/propertiesDb';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandlerWithParams<{ id: string }> = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await params;
  const propertyId = Number(id);
  if (!propertyId) return NextResponse.json({ error: 'Invalid property id' }, { status: 400 });
  const row = await getPropertyById(propertyId);
  if (!row) return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  return NextResponse.json({
    schedule_cron: row.schedule_cron,
    alert_webhook_url: row.alert_webhook_url,
    alert_email: row.alert_email,
  });
};

export const PUT: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const { id } = await params;
  const propertyId = Number(id);
  if (!propertyId) return NextResponse.json({ error: 'Invalid property id' }, { status: 400 });

  let body: {
    scheduleCron?: string | null;
    alertWebhookUrl?: string | null;
    alertEmail?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  await setPropertyOpsSettings(propertyId, {
    scheduleCron: body.scheduleCron,
    alertWebhookUrl: body.alertWebhookUrl,
    alertEmail: body.alertEmail,
  });
  return NextResponse.json({ ok: true });
};
