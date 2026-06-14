import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MERGE_SCRIPT = `
import json, sys
from website_profiling.integrations.keywords.competitor_csv import parse_competitor_keyword_csv
from website_profiling.integrations.keywords.competitor_gap_store import merge_competitor_keyword_import
from website_profiling.db.storage import db_session

payload = json.load(sys.stdin)
property_id = int(payload["propertyId"])
competitor = payload.get("competitor") or ""
rows = parse_competitor_keyword_csv(payload.get("csvText") or "", competitor=competitor)
with db_session() as conn:
    merged = merge_competitor_keyword_import(conn, property_id, competitor, rows)
print(json.dumps({"count": len(rows), "rows": rows[:500], "mergedCount": len(merged), "mergedRows": merged[:500]}))
`;

/**
 * POST /api/keywords/competitor-import
 * Body: { propertyId, competitor, csvText }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: { propertyId?: number; competitor?: string; csvText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const propertyId = Number(body.propertyId || 0);
  const competitor = String(body.competitor || '').trim();
  const csvText = String(body.csvText || '');
  if (!propertyId || !competitor || !csvText.trim()) {
    return NextResponse.json({ error: 'propertyId, competitor, and csvText required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', MERGE_SCRIPT], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot),
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c: Buffer | string) => { stderr += c.toString(); });
    proc.stdin?.write(JSON.stringify({ propertyId, competitor, csvText }));
    proc.stdin?.end();
    proc.on('close', (code) => {
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(
          NextResponse.json({
            count: parsed.count ?? 0,
            rows: parsed.rows ?? [],
            mergedCount: parsed.mergedCount ?? parsed.count ?? 0,
            mergedRows: parsed.mergedRows ?? parsed.rows ?? [],
          }),
        );
        return;
      }
      resolve(
        NextResponse.json(
          { error: (stderr || stdout).trim() || 'Import failed' },
          { status: 500 },
        ),
      );
    });
  });
};
