import { NextResponse, type NextRequest } from 'next/server';
import { getJob } from '@/server/pipelineJobs';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

function forbiddenIfNotLocal(request: NextRequest): NextResponse | null {
  const host = (request.headers.get('host') || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return NextResponse.json({ error: 'Only available on localhost' }, { status: 403 });
  }
  return null;
}

export const GET: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({
    status: job.status,
    exitCode: job.exitCode,
    log: job.log,
    error: job.error ?? null,
  });
};
