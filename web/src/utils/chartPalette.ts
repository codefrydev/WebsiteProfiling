/**
 * Chart palette and helpers for data visualization (colorblind-friendly, semantic).
 * Used by Charts, Lighthouse, and Overview views.
 */

// Colorblind-friendly categorical palette (blue/orange/distinct hues; avoid red-green only)
export const PALETTE_CATEGORICAL = [
  '#4C72B0', // blue
  '#DD8452', // orange
  '#55A868', // green
  '#C44E52', // red
  '#8172B3', // purple
  '#937860', // brown
  '#6B8E9F', // teal
  '#A8BF5A', // lime
];

/** Semantic colors for score bands (good / needs improvement / poor) */
export const SEMANTIC = {
  good: '#22C55E',     // green-500
  warn: '#EAB308',    // yellow-500
  poor: '#EF4444',    // red-500
  neutral: 'rgb(71, 85, 105)', // slate-500
};

export function scoreBandColor(score: number | null | undefined): string {
  if (score == null) return SEMANTIC.neutral;
  const s = Number(score);
  if (s >= 90) return SEMANTIC.good;
  if (s >= 50) return SEMANTIC.warn;
  return SEMANTIC.poor;
}

export function palette(n: number): string[] {
  return Array.from({ length: n }, (_, i) => PALETTE_CATEGORICAL[i % PALETTE_CATEGORICAL.length]);
}

export function sortByValue(
  labels: string[],
  values: number[],
  order: 'asc' | 'desc' = 'desc',
): { labels: string[]; values: number[] } {
  if (!labels.length || labels.length !== values.length) {
    return { labels: [...labels], values: [...values] };
  }
  const pairs: [string, number][] = labels.map((l, i) => [l, values[i] ?? 0]);
  // `Number(b[1]) - Number(a[1])` is already descending; only flip it for 'asc'.
  const mult = order === 'desc' ? 1 : -1;
  pairs.sort((a, b) => mult * (Number(b[1]) - Number(a[1])));
  return {
    labels: pairs.map((p) => p[0]),
    values: pairs.map((p) => p[1]),
  };
}
