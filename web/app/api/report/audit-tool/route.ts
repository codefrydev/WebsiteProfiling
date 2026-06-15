import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { spawnAuditTool } from '@/server/spawnAuditTool';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/report/audit-tool — dispatch allowlisted read-only audit tools for report UI.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: {
    toolName?: string;
    propertyId?: number;
    reportId?: number;
    args?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const toolName = String(body.toolName || '').trim();
  const propertyId = Number(body.propertyId || 0);
  if (!toolName || !propertyId) {
    return NextResponse.json({ error: 'toolName and propertyId required' }, { status: 400 });
  }

  const result = await spawnAuditTool({
    toolName,
    propertyId,
    reportId: body.reportId,
    args: body.args,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...result.data }, { status: result.status });
  }
  return NextResponse.json(result.data);
};
