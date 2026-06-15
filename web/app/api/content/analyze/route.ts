import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/content/analyze — SEO score + rule/AI suggestions (one-click analyzer).
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: {
    propertyId?: number;
    keyword?: string;
    bodyHtml?: string;
    titleTag?: string;
    metaDescription?: string;
    landingUrl?: string;
    title?: string;
    useAi?: boolean;
    refresh?: boolean;
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
from website_profiling.content_studio.ai_suggest import analyze_content_draft
payload = json.load(sys.stdin)
pid = payload.get("propertyId")
print(json.dumps(analyze_content_draft(
    int(pid) if pid else None,
    payload.get("keyword", ""),
    payload.get("bodyHtml", ""),
    payload.get("titleTag", ""),
    payload.get("metaDescription", ""),
    payload.get("landingUrl"),
    use_ai=bool(payload.get("useAi")),
    refresh=bool(payload.get("refresh")),
    title=payload.get("title", ""),
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
        title: body.title || '',
        useAi: body.useAi === true,
        refresh: body.refresh === true,
      }),
    );
    proc.stdin?.end();
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(NextResponse.json({ error: 'Analyze failed: could not start Python' }, { status: 500 }));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(NextResponse.json({ analysis: parsed }));
        return;
      }
      resolve(NextResponse.json({ error: 'Content analyze failed' }, { status: 500 }));
    });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(NextResponse.json({ error: 'Analyze timed out after 90s' }, { status: 504 }));
    }, 90_000);
  });
};
