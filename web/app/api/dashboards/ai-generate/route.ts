import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getRepoRoot, getPipelineSpawnEnv } from '@/server/pipelineSpawnEnv';
import { resolvePythonExecutable, parsePythonJsonStdout } from '@/server/resolvePython';
import { DASHBOARD_CATALOG, dimensions, measures } from '@/lib/dashboard/catalog/catalog';
import { VIZ_LABELS } from '@/lib/dashboard/viz/labels';
import { spawnAuditTool } from '@/server/spawnAuditTool';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DASHSCRIPT_HELP = `
DashScript is a lightweight formula language for dashboard widgets.

MEASURE (scalar formula, produces a single number or string):
  field("key")            — value from root result by dot-path key
  sum("col")              — sum of numeric column across all rows
  avg("col")              — average
  count()                 — number of rows
  min("col") / max("col") — min / max of column
  if(cond, thenVal, elseVal) — conditional
  coalesce(a, b, c)       — first non-null value
  Arithmetic: +  -  *  /  (division by zero returns null)
  Comparison: ==  !=  <  <=  >  >=
  Logical: &&  ||  !

TRANSFORM (row pipeline, applied to rows array before rendering):
  filter(expr)            — keep rows where expr is truthy (use row column names directly)
  sort(col, asc|desc)     — sort rows by column (default asc)
  take(N)                 — keep first N rows
  skip(N)                 — drop first N rows
  project(col1, col2)     — keep only listed columns
  Stages are joined with  |   e.g.  filter(count > 0) | sort(count, desc) | take(10)

Examples:
  measure:   field("health_score")
  measure:   sum("issues") / count()
  transform: filter(severity == "critical") | sort(count, desc) | take(5)
`.trim();

const PYTHON_SCRIPT = `
import json, sys
from website_profiling.llm.dashboard_ai import generate_dashboard_ai
payload = json.load(sys.stdin)
print(json.dumps(generate_dashboard_ai(payload)))
`;

/**
 * POST /api/dashboards/ai-generate
 * Body: { mode, prompt, toolName?, propertyId?, reportId? }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: {
    mode?: string;
    prompt?: string;
    toolName?: string;
    propertyId?: number;
    reportId?: number | null;
    current?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const mode = String(body.mode || 'widget').trim().toLowerCase();
  if (!['script', 'widget', 'dashboard'].includes(mode)) {
    return NextResponse.json({ error: 'mode must be script, widget, or dashboard' }, { status: 400 });
  }
  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 });
  }

  // Optionally fetch a sample result so the LLM knows the real schema
  let sample: Record<string, unknown> | null = null;
  const toolName = String(body.toolName || '').trim();
  const propertyId = Number(body.propertyId || 0);
  const reportId = body.reportId != null ? Number(body.reportId) : null;

  if (toolName && propertyId && (mode === 'script' || mode === 'widget')) {
    try {
      const result = await spawnAuditTool({ toolName, propertyId, reportId });
      if (result.ok) {
        // Truncate to keep payload small — first 2 rows of arrays, top-level scalars
        sample = truncateSample(result.data);
      }
    } catch {
      // non-fatal — proceed without sample
    }
  }

  const payload = {
    mode,
    prompt,
    catalog: DASHBOARD_CATALOG.map((e) => ({
      toolName: e.toolName,
      label: e.label,
      section: e.section,
      fields: e.fields,
      dimensions: dimensions(e).map((f) => ({ key: f.key, label: f.label, defaultAgg: f.defaultAgg, format: f.format })),
      measures: measures(e).map((f) => ({ key: f.key, label: f.label, defaultAgg: f.defaultAgg, format: f.format })),
      rowsPath: e.rowsPath,
      compatibleViz: e.compatibleViz,
    })),
    viz_types: VIZ_LABELS,
    dashscript_help: DASHSCRIPT_HELP,
    current: body.current ?? null,
    sample,
  };

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);

  return new Promise<Response>((resolve) => {
    const proc = spawn(pythonExe, ['-c', PYTHON_SCRIPT], {
      cwd: repoRoot,
      env: getPipelineSpawnEnv(repoRoot),
      shell: false,
    });
    let stdout = '';
    proc.stdout?.on('data', (c: Buffer | string) => { stdout += c.toString(); });
    proc.stdin?.write(JSON.stringify(payload));
    proc.stdin?.end();
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(NextResponse.json({ error: 'AI generation failed: could not start Python process' }, { status: 500 }));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parsePythonJsonStdout(stdout);
      if (code === 0 && parsed) {
        if ((parsed as { ok?: boolean }).ok === false) {
          const err = parsed as { error?: string; missing?: boolean };
          return resolve(NextResponse.json(parsed, { status: err.missing ? 503 : 500 }));
        }
        return resolve(NextResponse.json(parsed));
      }
      resolve(NextResponse.json({ error: 'AI generation failed' }, { status: 500 }));
    });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(NextResponse.json({ error: 'AI generation timed out after 120s' }, { status: 504 }));
    }, 120_000);
  });
};

function truncateSample(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      out[k] = v.slice(0, 2);
    } else {
      out[k] = v;
    }
  }
  return out;
}
