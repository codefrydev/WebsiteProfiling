import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPropertyById, setPropertyGoogleCredentials } from '@/server/propertiesDb';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

export const POST: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const { id } = await params;
  const propertyId = parseInt(id, 10);
  if (!Number.isFinite(propertyId)) {
    return NextResponse.json({ error: 'Invalid property id' }, { status: 400 });
  }
  const row = await getPropertyById(propertyId);
  if (!row) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }
  try {
    await setPropertyGoogleCredentials(propertyId, {
      refreshToken: null,
      authMode: null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
