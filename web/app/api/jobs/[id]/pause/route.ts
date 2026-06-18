import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { pausePipelineJob } from '@/server/pipelineJobs';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

/**
 * POST /api/jobs/:id/pause — send a pause signal to the running crawler.
 * The Python process saves its frontier state and exits with code 2; the
 * job status transitions to 'paused'.
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
  const result = await pausePipelineJob(id);
  if (!result.ok) {
    const status = result.error === 'Job not found' ? 404 : 409;
    return NextResponse.json({ error: result.error || 'Unable to pause job' }, { status });
  }
  return NextResponse.json({ ok: true });
};
