import type { Expr, EvalContext, EvalValue, PipelineStage } from '@/lib/dashboard/script/types';
import { DashScriptError } from '@/lib/dashboard/script/types';
import { tokenize } from '@/lib/dashboard/script/lexer';
import { Parser } from '@/lib/dashboard/script/parser';

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

function asNumber(v: EvalValue): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asBool(v: EvalValue): boolean {
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  return true;
}

function rowField(ctx: EvalContext, name: string): EvalValue {
  if (ctx.row && name in ctx.row) return ctx.row[name] as EvalValue;
  if (!(name in ctx.raw)) return null;
  return ctx.raw[name] as EvalValue;
}

function evalExpr(expr: Expr, ctx: EvalContext): EvalValue {
  switch (expr.kind) {
    case 'number':
      return Number.isNaN(expr.value) ? null : expr.value;
    case 'string':
      return expr.value;
    case 'bool':
      return expr.value;
    case 'null':
      return null;
    case 'field':
      return getPath(ctx.raw, expr.path) as EvalValue ?? null;
    case 'rowField':
      return rowField(ctx, expr.name);
    case 'unop': {
      const v = evalExpr(expr.arg, ctx);
      if (expr.op === '-') return -asNumber(v);
      if (expr.op === '!') return !asBool(v);
      throw new DashScriptError(`Unknown unary op ${expr.op}`);
    }
    case 'binop': {
      const l = evalExpr(expr.left, ctx);
      const r = evalExpr(expr.right, ctx);
      switch (expr.op) {
        case '+': return asNumber(l) + asNumber(r);
        case '-': return asNumber(l) - asNumber(r);
        case '*': return asNumber(l) * asNumber(r);
        case '/': return asNumber(r) === 0 ? null : asNumber(l) / asNumber(r);
        case '>': return asNumber(l) > asNumber(r);
        case '<': return asNumber(l) < asNumber(r);
        case '>=': return asNumber(l) >= asNumber(r);
        case '<=': return asNumber(l) <= asNumber(r);
        case '==':
          if (typeof l === 'string' || typeof r === 'string') return String(l ?? '') === String(r ?? '');
          return asNumber(l) === asNumber(r);
        case '!=':
          if (typeof l === 'string' || typeof r === 'string') return String(l ?? '') !== String(r ?? '');
          return asNumber(l) !== asNumber(r);
        case '&&': return asBool(l) && asBool(r);
        case '||': return asBool(l) || asBool(r);
        default: throw new DashScriptError(`Unknown operator ${expr.op}`);
      }
    }
    case 'call':
      return evalCall(expr.name, expr.args, ctx);
    default:
      throw new DashScriptError('Invalid expression node');
  }
}

function numsFromRows(rows: Record<string, unknown>[], field: string): number[] {
  return rows.map((r) => Number(r[field] ?? 0)).filter(Number.isFinite);
}

function evalCall(name: string, args: Expr[], ctx: EvalContext): EvalValue {
  const lower = name.toLowerCase();

  if (lower === 'if') {
    const cond = evalExpr(args[0], ctx);
    return asBool(cond) ? evalExpr(args[1], ctx) : evalExpr(args[2], ctx);
  }
  if (lower === 'coalesce') {
    for (const a of args) {
      const v = evalExpr(a, ctx);
      if (v !== null && v !== undefined && v !== '') return v;
    }
    return null;
  }
  if (lower === 'round') return Math.round(asNumber(evalExpr(args[0], ctx)));
  if (lower === 'abs') return Math.abs(asNumber(evalExpr(args[0], ctx)));
  if (lower === 'concat') return args.map((a) => String(evalExpr(a, ctx) ?? '')).join('');
  if (lower === 'len') return String(evalExpr(args[0], ctx) ?? '').length;

  // Aggregates over $rows
  if (lower === 'sum') {
    const field = fieldName(args[0], ctx);
    const nums = numsFromRows(ctx.rows, field);
    return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  }
  if (lower === 'avg') {
    const field = fieldName(args[0], ctx);
    const nums = numsFromRows(ctx.rows, field);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  }
  if (lower === 'count') {
    if (args.length === 0) return ctx.rows.length;
    const field = fieldName(args[0], ctx);
    return ctx.rows.filter((r) => r[field] != null && r[field] !== '').length;
  }
  if (lower === 'min') {
    const field = fieldName(args[0], ctx);
    const nums = numsFromRows(ctx.rows, field);
    return nums.length ? Math.min(...nums) : null;
  }
  if (lower === 'max') {
    const field = fieldName(args[0], ctx);
    const nums = numsFromRows(ctx.rows, field);
    return nums.length ? Math.max(...nums) : null;
  }
  if (lower === 'rows') return ctx.rows as EvalValue;
  if (lower === 'raw') return ctx.raw as EvalValue;

  throw new DashScriptError(`Unknown function "${name}"`);
}

function fieldName(expr: Expr, ctx: EvalContext): string {
  if (expr.kind === 'string') return expr.value;
  if (expr.kind === 'rowField') return expr.name;
  return String(evalExpr(expr, ctx) ?? '');
}

function runPipeline(rows: Record<string, unknown>[], stages: PipelineStage[], ctx: EvalContext): Record<string, unknown>[] {
  let cur = rows;
  for (const stage of stages) {
    const name = stage.name.toLowerCase();
    if (name === 'filter' || name === 'where') {
      cur = cur.filter((row) => {
        const rowCtx: EvalContext = { ...ctx, rows: cur, row };
        return asBool(evalExpr(stage.args[0], rowCtx));
      });
    } else if (name === 'sort') {
      const field = fieldName(stage.args[0], ctx);
      const order = stage.args[1] ? fieldName(stage.args[1], ctx).toLowerCase() : 'asc';
      cur = [...cur].sort((a, b) => {
        const av = asNumber(a[field] as EvalValue);
        const bv = asNumber(b[field] as EvalValue);
        return order === 'desc' ? bv - av : av - bv;
      });
    } else if (name === 'take' || name === 'limit') {
      const n = Math.max(0, Math.floor(asNumber(evalExpr(stage.args[0], ctx))));
      cur = cur.slice(0, n);
    } else if (name === 'skip') {
      const n = Math.max(0, Math.floor(asNumber(evalExpr(stage.args[0], ctx))));
      cur = cur.slice(n);
    } else if (name === 'project' || name === 'select') {
      const fields = stage.args.map((a) => fieldName(a, ctx));
      cur = cur.map((row) => {
        const out: Record<string, unknown> = {};
        for (const f of fields) out[f] = row[f];
        return out;
      });
    } else if (name === 'map') {
      const labelKey = fieldName(stage.args[0], ctx);
      const valueKey = fieldName(stage.args[1], ctx);
      cur = cur.map((row) => ({
        [labelKey]: row[labelKey],
        [valueKey]: row[valueKey],
      }));
    } else {
      throw new DashScriptError(`Unknown pipeline stage "${stage.name}"`);
    }
  }
  return cur;
}

/** Evaluate a scalar measure expression against fetched widget data. */
export function evalMeasure(source: string, ctx: EvalContext): number | string | null {
  if (!source.trim()) return null;
  const tokens = tokenize(source.trim());
  const expr = new Parser(tokens).parseExpr();
  const result = evalExpr(expr, ctx);
  if (result === null || typeof result === 'boolean') return result === null ? null : result ? 1 : 0;
  if (typeof result === 'number' || typeof result === 'string') return result;
  return null;
}

/** Apply a pipe-delimited transform pipeline to row data. */
export function evalTransform(source: string, ctx: EvalContext): Record<string, unknown>[] {
  if (!source.trim()) return ctx.rows;
  const tokens = tokenize(source.trim());
  const stages = new Parser(tokens).parsePipeline();
  return runPipeline(ctx.rows, stages, ctx);
}

export { parseExpr, parsePipeline } from '@/lib/dashboard/script/parser';

/** Built-in function reference for the script editor help panel. */
export const DASHSCRIPT_HELP = `
MEASURES (scalar values):
  field("health_score")           — read from tool result
  sum("count")                    — sum a column across rows
  avg("score")  count()  min("x") max("x")
  if(score >= 80, "Good", "Poor")
  coalesce(field("score"), 0)

TRANSFORMS (pipe stages on rows):
  filter(count > 0)
  | sort(score, desc)
  | take(10)
  | project(category, score)
  | skip(5)

Examples:
  Measure:  sum("count")
  Measure:  field("performance") * 100
  Transform: filter(severity == "critical") | sort(count, desc) | take(5)
`.trim();
