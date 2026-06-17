import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STEPS = new Set(['intents', 'content_types', 'tones', 'titles', 'outline', 'draft', 'research']);

/**
 * POST /api/content/wizard — one step of the guided-draft wizard.
 * Body: { step, keyword, locale?, intent?, contentType?, tone?, title?, outline? }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const step = String(body.step || '').trim();
  if (!VALID_STEPS.has(step)) {
    return NextResponse.json({ error: 'Invalid wizard step' }, { status: 400 });
  }

  const payload = {
    keyword: String(body.keyword || '').trim(),
    locale: String(body.locale || 'en-US'),
    intent: String(body.intent || ''),
    contentType: String(body.contentType || ''),
    tone: String(body.tone || ''),
    title: String(body.title || ''),
    outline: Array.isArray(body.outline) ? body.outline : [],
  };

  // The draft step writes a full article and can be slow on local models.
  const timeoutMs = step === 'draft' ? 180_000 : 60_000;

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const script = `
import json, sys
from website_profiling.content_studio.wizard import run_wizard_step
payload = json.load(sys.stdin)
print(json.dumps(run_wizard_step(payload.get("step", ""), payload.get("payload") or {})))
`;

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', script], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot),
      shell: false,
    });
    let stdout = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.stdin?.write(JSON.stringify({ step, payload }));
    proc.stdin?.end();
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(NextResponse.json({ error: 'Wizard failed: could not start Python' }, { status: 500 }));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        if (parsed.ok === false) {
          resolve(NextResponse.json({ error: parsed.error || 'Wizard step failed' }, { status: 400 }));
          return;
        }
        resolve(NextResponse.json({ result: parsed }));
        return;
      }
      resolve(NextResponse.json({ error: 'Wizard step failed' }, { status: 500 }));
    });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(NextResponse.json({ error: `Wizard step timed out after ${Math.round(timeoutMs / 1000)}s` }, { status: 504 }));
    }, timeoutMs);
  });
};
