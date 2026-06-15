import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { spawn } from 'child_process';
import path from 'path';
import { resolvePythonExecutable, formatPythonSpawnError } from '@/server/resolvePython';
import { getRepoRoot } from '@/server/pipelineSpawnEnv';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/alerts/check?propertyId= — run health alert rules and optional webhook dispatch.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const propertyId = Number(request.nextUrl.searchParams.get('propertyId') || '0');
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.tools.alert_checker import check_all_alerts, dispatch_webhook
from website_profiling.db.storage import db_session

property_id = int(sys.argv[1])
alerts = check_all_alerts(property_id)
webhook_sent = False
with db_session() as conn:
    cur = conn.execute(
        "SELECT alert_webhook_url FROM properties WHERE id = %s",
        (property_id,),
    )
    row = cur.fetchone()
    url = (row[0] if row and not hasattr(row, "keys") else (row.get("alert_webhook_url") if row else "")) or ""
    if url and alerts:
        webhook_sent = dispatch_webhook(url, {"property_id": property_id, "alerts": alerts})
print(json.dumps({"alerts": alerts, "webhook_sent": webhook_sent}))
`;

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', script, String(propertyId)], {
      cwd: repoRoot,
      shell: false,
    });
    let stdout = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.on('error', (err: Error) => {
      resolve(NextResponse.json({ error: formatPythonSpawnError(err, pythonExe, repoRoot) }, { status: 500 }));
    });
    proc.on('close', (code) => {
      try {
        const parsed = JSON.parse(stdout.trim() || '{}');
        resolve(NextResponse.json(parsed, { status: code === 0 ? 200 : 500 }));
      } catch {
        resolve(NextResponse.json({ error: stdout.trim() || 'Alert check failed' }, { status: 500 }));
      }
    });
  });
};
