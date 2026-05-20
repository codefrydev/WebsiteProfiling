import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { forbiddenIfNotLocal } from '@/server/localOnly';

export const runtime = 'nodejs';

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT =
  process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');
const DEFAULT_PYTHON = process.env.PYTHON || 'python';

/**
 * POST /api/integrations/google/keywords/expand
 * Body: { seeds: string[], sources?: string[] }
 *
 * Spawns Python to run Google Suggest expansion and returns a live preview.
 * Used by the bulk seed textarea in the Keywords Explorer UI.
 */
export async function POST(request) {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const seeds = Array.isArray(body?.seeds)
    ? body.seeds.filter((s) => typeof s === 'string' && s.trim()).slice(0, 30)
    : [];

  if (seeds.length === 0) {
    return NextResponse.json({ error: 'No seeds provided' }, { status: 400 });
  }

  const sources = Array.isArray(body?.sources) ? body.sources : ['web', 'youtube', 'questions'];
  const repoRoot = DEFAULT_REPO_ROOT;
  const pythonExe = String(process.env.PYTHON || DEFAULT_PYTHON).trim() || DEFAULT_PYTHON;

  // Build inline Python that imports suggest.py and returns JSON
  const pyScript = [
    'import json, sys',
    "sys.path.insert(0, '.')",
    'from src.website_profiling.integrations.google.suggest import batch_expand',
    `seeds = ${JSON.stringify(seeds)}`,
    `sources = tuple(${JSON.stringify(sources)})`,
    'result = batch_expand(seeds, sources=sources, max_workers=4)',
    'print(json.dumps(result, ensure_ascii=False))',
  ].join('\n');

  return new Promise((resolve) => {
    const proc = spawn(pythonExe, ['-c', pyScript], {
      cwd: repoRoot,
      env: { ...process.env },
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => (stdout += d.toString()));
    proc.stderr?.on('data', (d) => (stderr += d.toString()));

    proc.on('error', (err) => {
      resolve(NextResponse.json({ error: err.message }, { status: 500 }));
    });

    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve(NextResponse.json({ error: 'Suggest expansion timed out (45s)' }, { status: 504 }));
    }, 45_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return resolve(
          NextResponse.json(
            { error: 'Python error', detail: stderr.slice(0, 500) },
            { status: 500 },
          ),
        );
      }
      try {
        const result = JSON.parse(stdout.trim());
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
}
