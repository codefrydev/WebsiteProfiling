import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { setPropertyCrawlAuthorized } from '@/server/propertiesDb';
import { writeAuditLog } from '@/server/pipelineJobsDb';
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
  try {
    await setPropertyCrawlAuthorized(propertyId);
    void writeAuditLog('crawl_authorized', null, propertyId, {}).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
