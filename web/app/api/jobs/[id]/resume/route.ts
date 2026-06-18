import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { resumePipelineJob } from '@/server/pipelineJobs';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

/**
 * POST /api/jobs/:id/resume — spawn a new crawl job that restores the
 * frontier saved when the job was paused.
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
  const result = await resumePipelineJob(id);
  if (!result.ok) {
    const status = result.error === 'Job not found' ? 404 : 409;
    return NextResponse.json({ error: result.error || 'Unable to resume job' }, { status });
  }
  return NextResponse.json({ ok: true, newJobId: result.newJobId });
};
