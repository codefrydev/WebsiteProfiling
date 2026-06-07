import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/issues/fix-suggestion — on-demand LLM fix for one issue.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  let body: {
    message?: string;
    url?: string;
    priority?: string;
    category?: string;
    recommendation?: string;
    type?: string;
    refresh?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.llm.issue_fixes import generate_issue_fix_suggestion
payload = json.load(sys.stdin)
print(json.dumps(generate_issue_fix_suggestion(payload, refresh=bool(payload.get("refresh")))))
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
        message,
        url: body.url,
        priority: body.priority,
        category: body.category,
        recommendation: body.recommendation,
        type: body.type,
        refresh: body.refresh,
      }),
    );
    proc.stdin?.end();
    proc.on('close', (code) => {
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(NextResponse.json(parsed));
        return;
      }
      resolve(NextResponse.json({ error: stdout.trim() || 'Fix suggestion failed' }, { status: 500 }));
    });
  });
};
