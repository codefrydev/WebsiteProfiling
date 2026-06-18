import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PYTHON_SCRIPT = `
import json, sys
from website_profiling.llm.issues_action_plan import generate_issues_action_plan
payload = json.load(sys.stdin)
print(json.dumps(generate_issues_action_plan(payload, refresh=bool(payload.get("refresh")))))
`;

/**
 * POST /api/issues/action-plan — LLM remediation plan for deduplicated audit issues.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  let body: {
    domain?: string;
    issues?: unknown[];
    refresh?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const domain = String(body.domain || '').trim();
  if (!domain) {
    return NextResponse.json({ error: 'domain required' }, { status: 400 });
  }
  if (!Array.isArray(body.issues) || body.issues.length === 0) {
    return NextResponse.json({ error: 'issues required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const payload = {
    domain,
    issues: body.issues,
    refresh: body.refresh,
  };

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', PYTHON_SCRIPT], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot),
      shell: false,
    });
    let stdout = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.stdin?.write(JSON.stringify(payload));
    proc.stdin?.end();
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(NextResponse.json({ error: 'Action plan failed: could not start Python process' }, { status: 500 }));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(NextResponse.json(parsed));
        return;
      }
      resolve(NextResponse.json({ error: 'Action plan failed' }, { status: 500 }));
    });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(NextResponse.json({ error: 'Action plan timed out after 90s' }, { status: 504 }));
    }, 90_000);
  });
};
