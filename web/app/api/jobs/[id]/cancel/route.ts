import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { cancelPipelineJob } from '@/server/pipelineJobs';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

/**
 * POST /api/jobs/:id/cancel — stop a running pipeline job.
 */
export const POST: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  const { id } = await params;
  const result = await cancelPipelineJob(id);
  if (!result.ok) {
    const status = result.error === 'Job not found' ? 404 : 409;
    return NextResponse.json({ error: result.error || 'Unable to cancel job' }, { status });
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    error: result.error ?? null,
  });
};
