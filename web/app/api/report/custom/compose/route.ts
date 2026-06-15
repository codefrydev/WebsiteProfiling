import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { composeCustomReport } from '@/server/spawnCustomReport';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: {
    title?: string;
    sections?: Array<Record<string, unknown>>;
    propertyId?: number;
    reportId?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = String(body.title || '').trim();
  const propertyId = Number(body.propertyId || 0);
  const sections = body.sections;
  if (!title || !propertyId || !Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json({ error: 'title, propertyId, and sections required' }, { status: 400 });
  }
  if (sections.length > 12) {
    return NextResponse.json({ error: 'sections max 12' }, { status: 400 });
  }

  const result = await composeCustomReport({
    title,
    sections,
    propertyId,
    reportId: body.reportId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...result.data }, { status: result.status });
  }
  return NextResponse.json(result.data);
};
