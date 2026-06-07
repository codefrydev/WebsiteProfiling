import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import { loadPipelineConfig } from '@/server/pipelineConfig';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/bing/sync — fetch Bing Webmaster backlinks summary.
 */
export const POST: ApiRouteHandler = async (_request: NextRequest): Promise<Response> => {
  let state: Record<string, string | boolean>;
  try {
    const cfg = await loadPipelineConfig();
    state = cfg.state;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const apiKey = String(state.bing_webmaster_api_key || '').trim();
  const siteUrl = String(state.start_url || '').trim();
  if (!apiKey || !siteUrl) {
    return NextResponse.json(
      { error: 'Set bing_webmaster_api_key and start_url in pipeline settings.' },
      { status: 400 },
    );
  }

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.integrations.bing.webmaster import fetch_bing_backlinks_summary
api_key, site_url = sys.argv[1], sys.argv[2]
print(json.dumps(fetch_bing_backlinks_summary(api_key, site_url)))
`;

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', script, apiKey, siteUrl], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot),
      shell: false,
    });
    let stdout = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.on('close', (code) => {
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        resolve(NextResponse.json(parsed));
        return;
      }
      resolve(NextResponse.json({ error: stdout.trim() || 'Bing sync failed' }, { status: 500 }));
    });
  });
};
