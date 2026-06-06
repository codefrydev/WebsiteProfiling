import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/keywords/content-brief
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  let body: { keyword?: string; rows?: unknown[]; gaps?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const keyword = String(body.keyword || '').trim();
  if (!keyword) {
    return NextResponse.json({ error: 'keyword required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.llm.content_brief import generate_content_brief
payload = json.load(sys.stdin)
print(json.dumps(generate_content_brief(
    payload.get("keyword", ""),
    payload.get("rows") or [],
    payload.get("gaps"),
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
    proc.stdin?.write(JSON.stringify({ keyword, rows: body.rows || [], gaps: body.gaps || [] }));
    proc.stdin?.end();
    proc.on('close', (code) => {
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(NextResponse.json({ brief: parsed }));
        return;
      }
      resolve(NextResponse.json({ error: stdout.trim() || 'Brief failed' }, { status: 500 }));
    });
  });
};
