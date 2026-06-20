import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import { resolvePropertyIdFromRequest } from '@/server/resolvePropertyId';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

const WEB_CWD = process.cwd();
const DEFAULT_REPO_ROOT =
  process.env.WEBSITE_PROFILING_ROOT || path.resolve(WEB_CWD, '..');

interface PlannerPostBody {
  seeds: string[];
  propertyId?: number;
  domain?: string;
  langId?: number;
  geoIds?: number[];
}

/**
 * POST /api/integrations/google/keywords/planner
 * Body: { seeds: string[], propertyId?, domain?, langId?, geoIds? }
 *
 * Calls Google Ads KeywordPlanIdeaService.GenerateKeywordIdeas and returns
 * keyword ideas with official search volume and competition data.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  let body: PlannerPostBody;
  try {
    body = (await request.json()) as PlannerPostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { propertyId, error: propError } = await resolvePropertyIdFromRequest(
    body.propertyId != null ? String(body.propertyId) : null,
    body.domain ?? null,
  );
  if (propError || propertyId == null) {
    return NextResponse.json(
      { error: propError || 'propertyId or domain required' },
      { status: 400 },
    );
  }

  const seeds = Array.isArray(body?.seeds)
    ? body.seeds
        .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
        .slice(0, 30)
    : [];

  if (seeds.length === 0) {
    return NextResponse.json({ error: 'No seeds provided' }, { status: 400 });
  }

  const langId = typeof body.langId === 'number' ? body.langId : 1000;
  const geoIds =
    Array.isArray(body.geoIds) && body.geoIds.every((g) => typeof g === 'number')
      ? body.geoIds
      : [2840];

  const repoRoot = DEFAULT_REPO_ROOT;
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  const pyScript = [
    'import json, sys',
    "sys.path.insert(0, '.')",
    'from src.website_profiling.integrations.google.auth import build_ads_client',
    'from src.website_profiling.integrations.google.keyword_planner import generate_keyword_ideas',
    'from src.website_profiling.db.google_app_store import read_google_app_settings',
    `property_id = ${propertyId}`,
    `seeds = ${JSON.stringify(seeds)}`,
    `lang_id = ${langId}`,
    `geo_ids = ${JSON.stringify(geoIds)}`,
    'settings = read_google_app_settings()',
    'customer_id = (settings.get("login_customer_id") or "").replace("-", "")',
    'client = build_ads_client(property_id)',
    'ideas = generate_keyword_ideas(client, customer_id, seeds, lang_id=lang_id, geo_ids=geo_ids)',
    'print(json.dumps(ideas, ensure_ascii=False))',
  ].join('\n');

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', pyScript], {
      cwd: repoRoot,
      env: { ...process.env, WP_PROPERTY_ID: String(propertyId) },
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer | string) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d: Buffer | string) => {
      stderr += d.toString();
    });

    proc.on('error', (err: Error) => {
      resolve(
        NextResponse.json(
          { error: formatPythonSpawnError(err, pythonExe, repoRoot) },
          { status: 500 },
        ),
      );
    });

    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve(
        NextResponse.json(
          { error: 'Keyword Planner expansion timed out (60s)' },
          { status: 504 },
        ),
      );
    }, 60_000);

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
        const ideas: unknown = JSON.parse(stdout.trim());
        resolve(NextResponse.json({ ideas, provenance: 'Google Keyword Planner' }));
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
