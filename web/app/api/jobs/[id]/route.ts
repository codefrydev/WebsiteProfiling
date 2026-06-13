import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getJob } from '@/server/pipelineJobs';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

export const GET: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({
    status: job.status,
    exitCode: job.exitCode,
    log: job.log,
    error: job.error ?? null,
    logTruncated: job.logTruncated ?? false,
  });
};
