import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/content/score
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  let body: {
    propertyId?: number;
    keyword?: string;
    bodyHtml?: string;
    titleTag?: string;
    metaDescription?: string;
    landingUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const keyword = String(body.keyword || '').trim();
  if (!keyword) {
    return NextResponse.json({ error: 'keyword required' }, { status: 400 });
  }

  const propertyId = Number(body.propertyId || 0) || null;

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.content_studio.score import score_content_draft
payload = json.load(sys.stdin)
pid = payload.get("propertyId")
print(json.dumps(score_content_draft(
    int(pid) if pid else None,
    payload.get("keyword", ""),
    payload.get("bodyHtml", ""),
    payload.get("titleTag", ""),
    payload.get("metaDescription", ""),
    payload.get("landingUrl"),
)))
`;

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', script], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot),
      shell: false,
    });
    let stdout = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.stdin?.write(
      JSON.stringify({
        propertyId,
        keyword,
        bodyHtml: body.bodyHtml || '',
        titleTag: body.titleTag || '',
        metaDescription: body.metaDescription || '',
        landingUrl: body.landingUrl || null,
      }),
    );
    proc.stdin?.end();
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(NextResponse.json({ error: 'Content score failed: could not start Python process' }, { status: 500 }));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(NextResponse.json({ score: parsed }));
        return;
      }
      resolve(NextResponse.json({ error: 'Content score failed' }, { status: 500 }));
    });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(NextResponse.json({ error: 'Content score timed out after 30s' }, { status: 504 }));
    }, 30_000);
  });
};
