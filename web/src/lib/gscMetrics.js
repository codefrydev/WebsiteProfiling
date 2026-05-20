/**
 * GSC CTR may be stored as fraction (0.028) or percent (2.8) depending on pipeline stage.
 */
export function gscCtrPercent(value) {
  if (value == null || value === '') return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? n * 100 : n;
}

export function formatGscCtr(value) {
  const pct = gscCtrPercent(value);
  if (pct == null) return '—';
  return `${pct.toFixed(1)}%`;
}
