import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPropertyById, setPropertyCrawlPreset } from '@/server/propertiesDb';
import { isCrawlPresetId } from '@/lib/crawlPresets';
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
  return NextResponse.json({ default_crawl_preset: row.default_crawl_preset });
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

  let body: { preset?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const preset = String(body.preset || '').trim();
  if (preset && !isCrawlPresetId(preset)) {
    return NextResponse.json({ error: 'Invalid crawl preset' }, { status: 400 });
  }
  await setPropertyCrawlPreset(propertyId, preset || null);
  return NextResponse.json({ ok: true, default_crawl_preset: preset || null });
};
