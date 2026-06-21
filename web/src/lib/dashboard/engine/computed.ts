/**
 * Safe, structured computed measures — the replacement for the old DashScript
 * DSL. No parser, no `eval`/`Function`: just two JSON shapes evaluated by a
 * finite switch. Divide-by-zero and non-numeric inputs yield null (never
 * Infinity/NaN), so a bad computed field can't corrupt a chart.
 */
import type { ComputedField, Operand } from '@/lib/dashboard/engine/types';
import { dotGet, toNumber } from '@/lib/dashboard/engine/coerce';

function operandValue(op: Operand, row: Record<string, unknown>): number | null {
  if ('const' in op) return Number.isFinite(op.const) ? op.const : null;
  return toNumber(dotGet(row, op.field));
}

/** Evaluate a computed field against a single row → a number or null. */
export function evalComputed(cf: ComputedField, row: Record<string, unknown>): number | null {
  if (cf.kind === 'ratio') {
    const num = toNumber(dotGet(row, cf.numerator));
    const den = toNumber(dotGet(row, cf.denominator));
    if (num === null || den === null || den === 0) return null;
    return (num / den) * (cf.scale ?? 1);
  }
  // arithmetic
  const l = operandValue(cf.left, row);
  const r = operandValue(cf.right, row);
  if (l === null || r === null) return null;
  switch (cf.op) {
    case '+':
      return l + r;
    case '-':
      return l - r;
    case '*':
      return l * r;
    case '/':
      return r === 0 ? null : l / r;
    default:
      return null;
  }
}
