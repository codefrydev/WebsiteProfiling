import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

interface PageLiveResult {
  ok?: boolean;
  snapshotId?: number | null;
  source?: string;
  pageUrl?: string;
  gsc?: unknown;
  ga4?: unknown;
  dateRange?: { start?: string; end?: string };
  fetchedAt?: string | null;
  errors?: string[];
  error?: string;
}

/**
 * POST /api/integrations/google/page-live
 * Body: { url: string }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    body = {};
  }
  const url = (body.url || '').trim();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    let log = '';
    let stdout = '';
    const proc = spawn(pythonExe, ['-m', 'src', 'page-live', '--url', url], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(),
      shell: false,
    });

    const append = (chunk: Buffer | string): void => {
      const s = chunk.toString();
      log += s;
      stdout += s;
      if (log.length > 32_000) log = log.slice(-28_000);
    };
    proc.stdout?.on('data', append);
    proc.stderr?.on('data', append);

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve(
        NextResponse.json(
          { ok: false, error: formatPythonSpawnError(err, pythonExe, repoRoot), log },
          { status: 500 },
        ),
      );
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        const last = lines[lines.length - 1] || '{}';
        const data = JSON.parse(last) as PageLiveResult;
        if (code !== 0 && !data.ok && !data.gsc && !data.ga4) {
          resolve(
            NextResponse.json(
              { ok: false, error: data.error || 'Live fetch failed', log, ...data },
              { status: 500 },
            ),
          );
          return;
        }
        resolve(
          NextResponse.json({
            ok: true,
            fetchedAt: new Date().toISOString(),
            ...data,
          }),
        );
      } catch {
        resolve(
          NextResponse.json(
            { ok: false, error: 'Invalid response from page-live', log },
            { status: 500 },
          ),
        );
      }
    });

    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve(
        NextResponse.json({ ok: false, error: 'Live fetch timed out after 45s', log }, { status: 504 }),
      );
    }, 45_000);
  });
};
