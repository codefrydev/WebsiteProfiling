import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import {
  getActiveRunningJob,
  listRecentPipelineJobs,
  reconcileStaleRunningJobs,
} from '@/server/pipelineJobsDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs — list recent pipeline jobs and return the active running job (if any).
 * Reconciles stale running jobs before listing.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const limit = Math.min(
    100,
    Math.max(1, Number(request.nextUrl.searchParams.get('limit') || '20') || 20),
  );

  try {
    const reconciled = await reconcileStaleRunningJobs();
    const [jobs, active] = await Promise.all([
      listRecentPipelineJobs(limit),
      getActiveRunningJob(),
    ]);
    return NextResponse.json({ jobs, active, reconciled });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
