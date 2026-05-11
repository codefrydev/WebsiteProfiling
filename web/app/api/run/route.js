import { NextResponse } from 'next/server';
import { startPipelineJob } from '@/server/pipelineJobs';

export const runtime = 'nodejs';

function forbiddenIfNotLocal(request) {
  const host = (request.headers.get('host') || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return NextResponse.json({ error: 'Only available on localhost' }, { status: 403 });
  }
  return null;
}

export async function POST(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const id = startPipelineJob(body.command ?? null, body.config, {
      python: body.python,
      repoRoot: body.repoRoot,
      configContent: typeof body.configContent === 'string' ? body.configContent : undefined,
    });
    return NextResponse.json({ jobId: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
