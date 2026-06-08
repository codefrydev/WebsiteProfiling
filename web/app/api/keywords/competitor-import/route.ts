import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { resolvePythonExecutable } from '@/server/resolvePython';
import { withDb } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPO_ROOT = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');

export async function POST(request: NextRequest) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const propertyId = Number(body.propertyId || 0);
  const competitor = String(body.competitor || '').trim();
  const csvText = String(body.csvText || '');
  if (!propertyId || !competitor || !csvText.trim()) {
    return NextResponse.json({ error: 'propertyId, competitor, and csvText required' }, { status: 400 });
  }

  const python = resolvePythonExecutable(process.env.PYTHON, REPO_ROOT);
  const script = `
import json, sys
from website_profiling.integrations.keywords.competitor_csv import parse_competitor_keyword_csv
rows = parse_competitor_keyword_csv(sys.stdin.read(), competitor=sys.argv[1])
print(json.dumps({"count": len(rows), "rows": rows[:500]}))
`;
  return new Promise<Response>((resolve) => {
    const proc = spawn(python, ['-c', script, competitor], {
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONPATH: path.join(REPO_ROOT, 'src') },
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => { out += c.toString(); });
    proc.stderr.on('data', (c) => { err += c.toString(); });
    proc.stdin.write(csvText);
    proc.stdin.end();
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: err.trim() || 'import failed' }, { status: 500 }));
        return;
      }
      try {
        const parsed = JSON.parse(out) as { count?: number; rows?: unknown[] };
        const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
        void withDb(async (client) => {
          await client.query(
            `INSERT INTO pipeline_config (key, value, is_unknown, updated_at)
             VALUES ('competitor_keyword_gap_json', $1, false, now())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [JSON.stringify(rows)],
          );
        }).catch(() => {});
        resolve(NextResponse.json(parsed));
      } catch {
        resolve(NextResponse.json({ error: 'invalid response' }, { status: 500 }));
      }
    });
  });
}
