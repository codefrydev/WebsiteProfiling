/**
 * Number formatting for KPI / table / chart labels. Salvaged from the previous
 * dashboard implementation (viz/formatters.ts) — the only logic worth keeping.
 *
 * Supported `format` tokens:
 *   (none)   — integers grouped, decimals shown to 1 place
 *   "0"      — integer, thousands-grouped
 *   "0.0" / "0.00" — fixed decimals (any number of 0s)
 *   "0.0%"   — value is a FRACTION (0–1); scaled ×100 and suffixed with %
 *   "pct"    — value is ALREADY a percentage (0–100); suffixed with %
 *   "score"  — rendered as "N/100"
 */
export function formatValue(raw: number | string | null, format?: string): string {
  if (raw === null || raw === undefined) return '—';
  if (typeof raw === 'string') return raw;
  if (!Number.isFinite(raw)) return '—';

  if (!format) {
    return Number.isInteger(raw) ? raw.toLocaleString() : raw.toFixed(1);
  }
  if (format === 'score') return `${Math.round(raw)}/100`;
  if (format === 'pct') {
    return `${raw.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }

  const pattern = format.match(/^0(?:\.(0+))?(%?)$/);
  if (pattern) {
    const decimals = pattern[1] ? pattern[1].length : 0;
    const isPercent = pattern[2] === '%';
    const value = isPercent ? raw * 100 : raw;
    const text = value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return isPercent ? `${text}%` : text;
  }

  if (format.endsWith('%')) return `${(raw * 100).toFixed(1)}%`;
  return raw.toLocaleString();
}

export function thresholdColor(
  value: number | string | null,
  thresholds?: { value: number; color: string }[],
): string | undefined {
  if (value === null || !thresholds?.length) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return [...thresholds].sort((a, b) => b.value - a.value).find((t) => n >= t.value)?.color;
}
