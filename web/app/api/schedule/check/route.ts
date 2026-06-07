import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { spawn } from 'child_process';
import path from 'path';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

/**
 * POST /api/schedule/check — run due scheduled audits (calls Python schedule_runner).
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const repoRoot = process.env.WEBSITE_PROFILING_ROOT || path.resolve(process.cwd(), '..');
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-m', 'src.website_profiling.tools.schedule_runner'], {
      cwd: repoRoot,
      shell: false,
    });
    let out = '';
    proc.stdout?.on('data', (c) => { out += c.toString(); });
    proc.stderr?.on('data', (c) => { out += c.toString(); });
    proc.on('close', (code) => {
      const staleProc = spawn(
        'python3',
        [
          '-c',
          'from website_profiling.tools.schedule_runner import run_gsc_links_staleness_alerts; import json; print(json.dumps(run_gsc_links_staleness_alerts()))',
        ],
        { cwd: repoRoot, shell: false },
      );
      let staleOut = '';
      staleProc.stdout?.on('data', (c) => { staleOut += c.toString(); });
      staleProc.on('close', () => {
        let stale: unknown[] = [];
        try {
          stale = JSON.parse(staleOut.trim() || '[]');
        } catch {
          stale = [];
        }
        resolve(
          NextResponse.json(
            { ok: code === 0, output: out.trim(), gscLinksStale: stale },
            { status: code === 0 ? 200 : 500 },
          ),
        );
      });
    });
  });
};
