import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { requireApiAuth } from '@/server/auth';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/backlinks/third-party-import
 * Body: { propertyId, provider: 'moz'|'majestic', csvText, ourDomains?: string[] }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: {
    propertyId?: number;
    provider?: string;
    csvText?: string;
    ourDomains?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const propertyId = Number(body.propertyId || 0);
  const provider = String(body.provider || 'moz').trim().toLowerCase();
  const csvText = String(body.csvText || '');
  if (!propertyId || !csvText.trim()) {
    return NextResponse.json({ error: 'propertyId and csvText required' }, { status: 400 });
  }
  if (provider !== 'moz' && provider !== 'majestic') {
    return NextResponse.json({ error: 'provider must be moz or majestic' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.integrations.links.third_party_csv import build_third_party_overlay
from website_profiling.integrations.google.gsc_links_store import import_third_party_links_overlay
from website_profiling.db.storage import db_session

payload = json.load(sys.stdin)
property_id = int(payload["propertyId"])
overlay = build_third_party_overlay(
    payload.get("provider") or "moz",
    payload.get("csvText") or "",
    payload.get("ourDomains") or [],
)
with db_session() as conn:
    result = import_third_party_links_overlay(conn, property_id, overlay)
print(json.dumps(result))
`;

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', script], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot),
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c: Buffer | string) => { stderr += c.toString(); });
    proc.stdin?.write(
      JSON.stringify({
        propertyId,
        provider,
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
        resolve(NextResponse.json(parsed));
        return;
      }
      resolve(NextResponse.json({ error: 'Third-party backlink import failed' }, { status: 500 }));
    });
  });
};
