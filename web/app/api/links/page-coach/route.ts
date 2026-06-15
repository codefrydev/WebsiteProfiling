import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

interface PageCoachBody {
  url?: string;
  refresh?: boolean;
  currentType?: 'snapshot' | 'live';
  currentId?: number;
  baselineType?: 'snapshot' | 'live';
  baselineId?: number;
}

/**
 * POST /api/links/page-coach
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: PageCoachBody = {};
  try {
    body = (await request.json()) as PageCoachBody;
  } catch {
    body = {};
  }

  const url = (body.url || '').trim();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const args = ['-m', 'src', 'page-coach', '--url', url];
  if (body.refresh) args.push('--refresh');

  return new Promise<Response>((resolve) => {
    let log = '';
    let stdout = '';
    const env = { ...getPipelineSpawnEnv() };
    if (body.currentType && body.currentId != null) {
      env.WP_PAGE_COACH_CURRENT = `${body.currentType}:${body.currentId}`;
    }
    if (body.baselineType && body.baselineId != null) {
      env.WP_PAGE_COACH_BASELINE = `${body.baselineType}:${body.baselineId}`;
    }

    const proc = spawn(pythonExe, args, {
      cwd: repoRoot,
      env,
      shell: false,
    });

    const append = (chunk: Buffer | string): void => {
      const s = chunk.toString();
      log += s;
      stdout += s;
      if (log.length > 48_000) log = log.slice(-40_000);
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
        const data = JSON.parse(last) as {
          ok?: boolean;
          cached?: boolean;
          coach?: Record<string, unknown>;
          error?: string;
        };
        if (!data.ok) {
          resolve(
            NextResponse.json(
              { ok: false, error: data.error || 'Page coach failed', log },
              { status: 500 },
            ),
          );
          return;
        }
        resolve(NextResponse.json({ ok: true, cached: data.cached, coach: data.coach, log: code !== 0 ? log : undefined }));
      } catch {
        resolve(
          NextResponse.json({ ok: false, error: 'Invalid page-coach response', log }, { status: 500 }),
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
        NextResponse.json({ ok: false, error: 'Page coach timed out after 90s', log }, { status: 504 }),
      );
    }, 90_000);
  });
};
