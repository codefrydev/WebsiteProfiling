import { fetchAuditTool } from '@/lib/fetchAuditTool';
import type { WidgetBinding, AggregateOp } from '@/lib/dashboard/types';
import { evalMeasure, evalTransform } from '@/lib/dashboard/script/eval';
import { DashScriptError } from '@/lib/dashboard/script/types';

export interface WidgetData {
  raw: Record<string, unknown>;
  rows: Record<string, unknown>[];
  kpiValue: number | string | null;
}

function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

function asRows(val: unknown): Record<string, unknown>[] {
  if (Array.isArray(val)) return val as Record<string, unknown>[];
  if (val != null && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const arr = Object.values(obj).find(Array.isArray);
    if (arr) return arr as Record<string, unknown>[];
  }
  return [];
}

function aggregate(rows: Record<string, unknown>[], field: string | undefined, op: AggregateOp): number | null {
  if (!field || !rows.length) return null;
  const nums = rows.map((r) => Number(r[field] ?? 0)).filter(Number.isFinite);
  if (!nums.length) return null;
  switch (op) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'count': return nums.length;
    case 'max': return Math.max(...nums);
    case 'min': return Math.min(...nums);
    default: return null;
  }
}

const IN_FLIGHT = new Map<string, Promise<Record<string, unknown>>>();
const RESULT_CACHE = new Map<string, { at: number; value: Record<string, unknown> }>();

/** How long a tool result is reused before refetching. Audit data is static between reports. */
export const WIDGET_DATA_TTL_MS = 30_000;

function cacheKey(toolName: string, propertyId: number, reportId: number | null | undefined, args: Record<string, unknown>): string {
  return `${toolName}|${propertyId}|${reportId ?? ''}|${JSON.stringify(args)}`;
}

/**
 * Clear cached widget results. Call when the active report/property changes so
 * widgets refetch fresh data instead of serving a stale cached payload.
 */
export function clearWidgetDataCache(): void {
  RESULT_CACHE.clear();
}

async function fetchWithCache(
  toolName: string,
  propertyId: number,
  reportId: number | null | undefined,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const key = cacheKey(toolName, propertyId, reportId, args);

  const cached = RESULT_CACHE.get(key);
  if (cached && Date.now() - cached.at < WIDGET_DATA_TTL_MS) return cached.value;

  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;

  const promise = fetchAuditTool({ toolName, propertyId, reportId, args })
    .then((value) => {
      RESULT_CACHE.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      IN_FLIGHT.delete(key);
    });
  IN_FLIGHT.set(key, promise);
  return promise;
}

export async function fetchWidgetData(
  binding: WidgetBinding,
  propertyId: number,
  reportId: number | null | undefined,
): Promise<WidgetData> {
  const args = binding.args ?? {};
  const raw = await fetchWithCache(binding.toolName, propertyId, reportId, args);

  const selected = getPath(raw, binding.select);
  const context = selected ?? raw;
  const rowsRaw = asRows(context);

  let kpiValue: number | string | null = null;
  let rows = rowsRaw;

  const scriptCtx = { raw, rows: rowsRaw };

  if (binding.useScript && binding.transform?.trim()) {
    try {
      rows = evalTransform(binding.transform, scriptCtx);
    } catch (e) {
      if (e instanceof DashScriptError) throw e;
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  }

  if (binding.useScript && binding.measure?.trim()) {
    try {
      kpiValue = evalMeasure(binding.measure, { raw, rows });
    } catch (e) {
      if (e instanceof DashScriptError) throw e;
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  } else {
    if (binding.valueField) {
      // Resolve against the selected context first, then fall back to the raw result.
      // This lets a single tool feed both a rows-based chart (via `select`) and a
      // scalar KPI from a top-level field, without the two bindings fighting.
      const direct = getPath(context, binding.valueField) ?? getPath(raw, binding.valueField);
      if (direct !== undefined && direct !== null) {
        kpiValue = typeof direct === 'number' || typeof direct === 'string' ? direct : String(direct);
      }
    }

    if (kpiValue === null && binding.aggregate && binding.aggregate !== 'none' && binding.yField) {
      const agg = aggregate(rowsRaw, binding.yField, binding.aggregate);
      if (agg !== null) kpiValue = agg;
    }
  }

  return { raw, rows, kpiValue };
}
