import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

/** Deprecated: use GET /api/properties/{id}/google/properties */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const propertyId = request.nextUrl.searchParams.get('propertyId');
  if (!propertyId) {
    return NextResponse.json(
      {
        error:
          'propertyId query parameter is required. Use /api/properties/{id}/google/properties instead.',
      },
      { status: 400 },
    );
  }

  const url = new URL(
    `/api/properties/${propertyId}/google/properties`,
    request.nextUrl.origin,
  );
  const res = await fetch(url.toString(), { headers: request.headers });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
};
