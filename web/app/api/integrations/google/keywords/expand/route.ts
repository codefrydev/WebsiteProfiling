import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import type { ApiRouteHandler, KeywordExpandPostBody } from '@/types/api';

export const runtime = 'nodejs';

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT =
  process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');

/**
 * POST /api/integrations/google/keywords/expand
 * Body: { seeds: string[], sources?: string[] }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  let body: KeywordExpandPostBody;
  try {
    body = (await request.json()) as KeywordExpandPostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const seeds = Array.isArray(body?.seeds)
    ? body.seeds.filter((s): s is string => typeof s === 'string' && Boolean(s.trim())).slice(0, 30)
    : [];

  if (seeds.length === 0) {
    return NextResponse.json({ error: 'No seeds provided' }, { status: 400 });
  }

  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s): s is string => typeof s === 'string')
    : ['web', 'youtube', 'questions'];
  const repoRoot = DEFAULT_REPO_ROOT;
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  const pyScript = [
    'import json, sys',
    "sys.path.insert(0, '.')",
    'from src.website_profiling.integrations.google.suggest import batch_expand',
    `seeds = ${JSON.stringify(seeds)}`,
    `sources = tuple(${JSON.stringify(sources)})`,
    'result = batch_expand(seeds, sources=sources, max_workers=4)',
    'print(json.dumps(result, ensure_ascii=False))',
  ].join('\n');

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', pyScript], {
      cwd: repoRoot,
      env: { ...process.env },
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer | string) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer | string) => { stderr += d.toString(); });

    proc.on('error', (err: Error) => {
      resolve(
        NextResponse.json({ error: formatPythonSpawnError(err, pythonExe, repoRoot) }, { status: 500 }),
      );
    });

    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(NextResponse.json({ error: 'Suggest expansion timed out (45s)' }, { status: 504 }));
    }, 45_000);

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { error: 'Python error', detail: stderr.slice(0, 500) },
            { status: 500 },
          ),
        );
        return;
      }
      try {
        const result: unknown = JSON.parse(stdout.trim());
        resolve(NextResponse.json({ results: result }));
      } catch {
        resolve(
          NextResponse.json(
            { error: 'Failed to parse Python output', detail: stdout.slice(0, 500) },
            { status: 500 },
          ),
        );
      }
    });
  });
};
