import type { ReportLink } from '@/types';

/**
 * Advanced multi-condition filtering for the Links explorer table.
 *
 * Screaming Frog / Sitebulb let users express arbitrary AND-composed conditions
 * (e.g. "status in 4xx AND word_count < 300 AND response_time > 2000"). The quick
 * dropdown filters in LinksFilterBar only cover a handful of fixed buckets; this
 * module adds a small predicate engine over the same ReportLink rows.
 *
 * Pure logic only (no React) so it can be unit-tested under the node vitest env.
 */

export type FieldKind = 'number' | 'string' | 'status';

export interface FilterFieldDef {
  /** Stable identifier persisted in saved views. */
  key: string;
  label: string;
  kind: FieldKind;
}

export const FILTER_FIELDS: readonly FilterFieldDef[] = [
  { key: 'url', label: 'URL', kind: 'string' },
  { key: 'title', label: 'Title', kind: 'string' },
  { key: 'title_length', label: 'Title length', kind: 'number' },
  { key: 'status', label: 'Status code', kind: 'status' },
  { key: 'inlinks', label: 'Inlinks', kind: 'number' },
  { key: 'outlinks', label: 'Outlinks', kind: 'number' },
  { key: 'depth', label: 'Crawl depth', kind: 'number' },
  { key: 'word_count', label: 'Word count', kind: 'number' },
  { key: 'response_time_ms', label: 'Response time (ms)', kind: 'number' },
  { key: 'pagerank', label: 'Internal PageRank', kind: 'number' },
  { key: 'console_error_count', label: 'Console errors', kind: 'number' },
  { key: 'page_error_count', label: 'Page errors', kind: 'number' },
];

export const FILTER_FIELDS_BY_KEY: Record<string, FilterFieldDef> = Object.fromEntries(
  FILTER_FIELDS.map((f) => [f.key, f]),
);

export interface OperatorDef {
  op: string;
  label: string;
}

export const NUMBER_OPERATORS: readonly OperatorDef[] = [
  { op: 'eq', label: '=' },
  { op: 'ne', label: '≠' },
  { op: 'gt', label: '>' },
  { op: 'gte', label: '≥' },
  { op: 'lt', label: '<' },
  { op: 'lte', label: '≤' },
];

export const STRING_OPERATORS: readonly OperatorDef[] = [
  { op: 'contains', label: 'contains' },
  { op: 'not_contains', label: 'does not contain' },
  { op: 'eq', label: 'is' },
  { op: 'starts_with', label: 'starts with' },
  { op: 'ends_with', label: 'ends with' },
];

export const STATUS_OPERATORS: readonly OperatorDef[] = [
  { op: 'eq', label: 'is' },
  { op: 'ne', label: 'is not' },
  { op: 'class', label: 'in class (e.g. 4xx)' },
  { op: 'gte', label: '≥' },
  { op: 'lte', label: '≤' },
];

export function operatorsForKind(kind: FieldKind): readonly OperatorDef[] {
  if (kind === 'number') return NUMBER_OPERATORS;
  if (kind === 'status') return STATUS_OPERATORS;
  return STRING_OPERATORS;
}

export interface AdvancedCondition {
  /** Client-only identifier for React keys; not semantically meaningful. */
  id: string;
  field: string;
  op: string;
  value: string;
}

/** Build a fresh condition with a sensible default operator for the field's kind. */
export function makeCondition(id: string, field = 'status'): AdvancedCondition {
  const def = FILTER_FIELDS_BY_KEY[field] ?? FILTER_FIELDS[0];
  return { id, field: def.key, op: operatorsForKind(def.kind)[0].op, value: '' };
}

/** A condition only filters once it has a value; incomplete rows are ignored. */
export function isConditionComplete(cond: AdvancedCondition): boolean {
  const def = FILTER_FIELDS_BY_KEY[cond.field];
  if (!def) return false;
  return cond.value.trim().length > 0;
}

export function countActiveConditions(conditions: readonly AdvancedCondition[]): number {
  return conditions.filter(isConditionComplete).length;
}

function numericValue(link: ReportLink, key: string): number {
  switch (key) {
    case 'title_length':
      return (link.title ?? '').length;
    case 'inlinks':
      return link.inlinks ?? 0;
    case 'outlinks':
      return link.outlinks ?? 0;
    case 'depth':
      return link.depth ?? 0;
    case 'word_count':
      return link.word_count ?? 0;
    case 'response_time_ms':
      return link.response_time_ms ?? 0;
    case 'pagerank':
      return link.pagerank ?? 0;
    case 'console_error_count':
      return link.console_error_count ?? 0;
    case 'page_error_count':
      return link.page_error_count ?? 0;
    default:
      return 0;
  }
}

function stringValue(link: ReportLink, key: string): string {
  switch (key) {
    case 'url':
      return link.url ?? '';
    case 'title':
      return link.title ?? '';
    case 'status':
      return String(link.status ?? '');
    default:
      return '';
  }
}

function evaluateString(link: ReportLink, def: FilterFieldDef, cond: AdvancedCondition): boolean {
  const hay = stringValue(link, def.key).toLowerCase();
  const needle = cond.value.trim().toLowerCase();
  switch (cond.op) {
    case 'contains':
      return hay.includes(needle);
    case 'not_contains':
      return !hay.includes(needle);
    case 'eq':
      return hay === needle;
    case 'starts_with':
      return hay.startsWith(needle);
    case 'ends_with':
      return hay.endsWith(needle);
    default:
      return true;
  }
}

function evaluateStatus(link: ReportLink, cond: AdvancedCondition): boolean {
  const raw = stringValue(link, 'status').trim();
  const target = cond.value.trim();
  if (cond.op === 'eq') return raw === target;
  if (cond.op === 'ne') return raw !== target;
  if (cond.op === 'class') {
    // "4xx" / "40x" / "4" all match by the leading digits before the x's.
    const lead = target.toLowerCase().replace(/x+$/, '');
    return lead.length > 0 && raw.startsWith(lead);
  }
  const n = Number(raw);
  const t = Number(target);
  if (Number.isNaN(n) || Number.isNaN(t)) return false;
  if (cond.op === 'gte') return n >= t;
  if (cond.op === 'lte') return n <= t;
  return true;
}

function evaluateNumber(link: ReportLink, def: FilterFieldDef, cond: AdvancedCondition): boolean {
  const n = numericValue(link, def.key);
  const target = Number(cond.value.trim());
  if (Number.isNaN(target)) return true; // not yet a valid number → don't filter
  switch (cond.op) {
    case 'eq':
      return n === target;
    case 'ne':
      return n !== target;
    case 'gt':
      return n > target;
    case 'gte':
      return n >= target;
    case 'lt':
      return n < target;
    case 'lte':
      return n <= target;
    default:
      return true;
  }
}

/** Evaluate a single condition. Unknown/incomplete conditions never exclude a row. */
export function evaluateCondition(link: ReportLink, cond: AdvancedCondition): boolean {
  const def = FILTER_FIELDS_BY_KEY[cond.field];
  if (!def || !isConditionComplete(cond)) return true;
  if (def.kind === 'string') return evaluateString(link, def, cond);
  if (def.kind === 'status') return evaluateStatus(link, cond);
  return evaluateNumber(link, def, cond);
}

export function matchesAllConditions(
  link: ReportLink,
  conditions: readonly AdvancedCondition[],
): boolean {
  return conditions.every((c) => evaluateCondition(link, c));
}

/** Apply all complete conditions with AND semantics. */
export function applyAdvancedConditions(
  links: readonly ReportLink[],
  conditions: readonly AdvancedCondition[],
): ReportLink[] {
  const active = conditions.filter(isConditionComplete);
  if (!active.length) return [...links];
  return links.filter((l) => matchesAllConditions(l, active));
}

/** Validate/repair conditions loaded from a saved view (drops unknown fields). */
export function sanitizeConditions(raw: unknown, idPrefix = 'saved'): AdvancedCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: AdvancedCondition[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const rec = item as Record<string, unknown>;
    const field = String(rec.field ?? '');
    const def = FILTER_FIELDS_BY_KEY[field];
    if (!def) return;
    const op = String(rec.op ?? '');
    const validOp = operatorsForKind(def.kind).some((o) => o.op === op);
    out.push({
      id: `${idPrefix}-${i}`,
      field,
      op: validOp ? op : operatorsForKind(def.kind)[0].op,
      value: rec.value == null ? '' : String(rec.value),
    });
  });
  return out;
}
