/**
 * Foundational pure helpers: numeric coercion, dot-path access, label
 * humanization, percentile. No dependencies — the base of the engine.
 */

/**
 * Coerce a value to a finite number, or null when it cannot be.
 *
 * Unlike the old engine, missing/invalid values become `null` (skipped by
 * aggregations) rather than silently coerced to 0 — which was a whole class of
 * "the numbers are wrong" bugs.
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Read a (possibly nested) dot-path from an object. */
export function dotGet(obj: unknown, path: string): unknown {
  if (!path) return obj;
  if (path.indexOf('.') === -1) {
    return obj == null || typeof obj !== 'object'
      ? undefined
      : (obj as Record<string, unknown>)[path];
  }
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

/** Turn a field key into a human label: last dot segment, underscores → spaces, title-ish. */
export function humanize(key: string): string {
  const last = key.split('.').pop() ?? key;
  const spaced = last.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Linear-interpolated percentile of a numeric array. `q` in [0,1].
 * Returns null for an empty input. Does not mutate the input.
 */
export function percentile(values: number[], q: number): number | null {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  const sorted = [...nums].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}
