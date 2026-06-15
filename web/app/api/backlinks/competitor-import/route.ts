import { NextResponse, type NextRequest } from 'next/server';
import { requireApiAuth } from '@/server/auth';
import { spawn } from 'child_process';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/backlinks/competitor-import
 * Body: { competitor, csvText, ourDomains?: string[] }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: { competitor?: string; csvText?: string; ourDomains?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const competitor = String(body.competitor || '').trim();
  const csvText = String(body.csvText || '');
  if (!competitor || !csvText.trim()) {
    return NextResponse.json({ error: 'competitor and csvText required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.integrations.google.competitor_links import (
    parse_referring_domains_from_csv,
    build_competitor_domain_gap,
)
payload = json.load(sys.stdin)
refs = parse_referring_domains_from_csv(payload.get("csvText") or "")
our = set(payload.get("ourDomains") or [])
print(json.dumps(build_competitor_domain_gap(our, payload.get("competitor") or "", refs)))
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
        competitor,
        csvText,
        ourDomains: body.ourDomains || [],
      }),
    );
    proc.stdin?.end();
    proc.on('error', () => {
      resolve(NextResponse.json({ error: 'Import failed: could not start Python process' }, { status: 500 }));
    });
    proc.on('close', (code) => {
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(NextResponse.json({ gap: parsed }));
        return;
      }
      resolve(NextResponse.json({ error: 'Competitor backlink import failed' }, { status: 500 }));
    });
  });
};
