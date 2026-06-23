import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { fastApiBase } from '@/server/fastApiClient';
import { DASHBOARD_CATALOG, dimensions, measures } from '@/lib/dashboard/catalog/catalog';
import { VIZ_LABELS } from '@/lib/dashboard/viz/labels';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DASHSCRIPT_HELP = `
DashScript is a lightweight formula language for dashboard widgets.

MEASURE (scalar formula, produces a single number or string):
  field("key")            — value from root result by dot-path key
  sum("col")              — sum of numeric column across all rows
  avg("col")               — average
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

/**
 * POST /api/dashboards/ai-generate
 * Body: { mode, prompt, toolName?, propertyId?, reportId?, current? }
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

  const payload = {
    mode,
    prompt,
    toolName: String(body.toolName || '').trim() || undefined,
    propertyId: Number(body.propertyId || 0) || undefined,
    reportId: body.reportId != null ? Number(body.reportId) : undefined,
    catalog: DASHBOARD_CATALOG.map((e) => ({
      toolName: e.toolName,
      label: e.label,
      section: e.section,
      fields: e.fields,
      dimensions: dimensions(e).map((f) => ({
        key: f.key,
        label: f.label,
        defaultAgg: f.defaultAgg,
        format: f.format,
      })),
      measures: measures(e).map((f) => ({
        key: f.key,
        label: f.label,
        defaultAgg: f.defaultAgg,
        format: f.format,
      })),
      rowsPath: e.rowsPath,
      compatibleViz: e.compatibleViz,
    })),
    viz_types: VIZ_LABELS,
    dashscript_help: DASHSCRIPT_HELP,
    current: body.current ?? null,
  };

  try {
    const res = await fetch(`${fastApiBase()}/api/dashboards/ai-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || 'AI generation failed' }, { status: 500 });
  }
};
