import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { startPipelineJobAsync } from '@/server/pipelineJobs';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/page-markdown/extract
 * Body: { crawlRunId: number, strategy?: 'main_only' | 'full_body', overwrite?: boolean }
 *
 * Spawns a `page-markdown` CLI job and returns a jobId to poll.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: {
    crawlRunId?: number;
    strategy?: string;
    overwrite?: boolean;
    workers?: number;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const crawlRunId = Number(body.crawlRunId ?? 0);
  if (!crawlRunId) {
    return NextResponse.json({ error: 'crawlRunId required' }, { status: 400 });
  }

  const strategy = body.strategy === 'full_body' ? 'full_body' : 'main_only';
  const overwrite = body.overwrite !== false;
  const workers = Math.min(16, Math.max(1, Number(body.workers ?? 4)));

  // Build CLI command: page-markdown --crawl-run-id N --strategy S [--no-overwrite] --workers N
  let command = `page-markdown --crawl-run-id ${crawlRunId} --strategy ${strategy} --workers ${workers}`;
  if (!overwrite) command += ' --no-overwrite';

  try {
    const jobId = await startPipelineJobAsync(command, null);
    return NextResponse.json({ jobId, crawlRunId, strategy, overwrite });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
