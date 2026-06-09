import { NextResponse, type NextRequest } from 'next/server';
import { deleteSavedFilter, listSavedFilters, upsertSavedFilter } from '@/server/savedFiltersDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const propertyId = Number(request.nextUrl.searchParams.get('propertyId') || 0);
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }
  const filters = await listSavedFilters(propertyId);
  return NextResponse.json({ filters });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = Number(body.propertyId || 0);
  const name = String(body.name || '').trim();
  const filterJson = (body.filterJson && typeof body.filterJson === 'object') ? body.filterJson : {};
  if (!propertyId || !name) {
    return NextResponse.json({ error: 'propertyId and name required' }, { status: 400 });
  }
  await upsertSavedFilter(propertyId, name, filterJson);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = Number(body.propertyId || 0);
  const name = String(body.name || '').trim();
  if (!propertyId || !name) {
    return NextResponse.json({ error: 'propertyId and name required' }, { status: 400 });
  }
  await deleteSavedFilter(propertyId, name);
  return NextResponse.json({ ok: true });
}
