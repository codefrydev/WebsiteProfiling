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

/**
 * Get color for a Lighthouse/category score (0-100).
 * @param {number|null} score
 * @returns {string}
 */
export function scoreBandColor(score) {
  if (score == null) return SEMANTIC.neutral;
  const s = Number(score);
  if (s >= 90) return SEMANTIC.good;
  if (s >= 50) return SEMANTIC.warn;
  return SEMANTIC.poor;
}

/**
 * Return an array of n colors from the categorical palette (cycled).
 * @param {number} n
 * @returns {string[]}
 */
export function palette(n) {
  return Array.from({ length: n }, (_, i) => PALETTE_CATEGORICAL[i % PALETTE_CATEGORICAL.length]);
}

/**
 * Sort label/value pairs by value. Keeps labels and values in sync.
 * @param {string[]} labels
 * @param {number[]} values
 * @param {'asc'|'desc'} order - 'desc' for "top" charts (largest first), 'asc' for "worst first"
 * @returns {{ labels: string[], values: number[] }}
 */
export function sortByValue(labels, values, order = 'desc') {
  if (!labels.length || labels.length !== values.length) return { labels: [...labels], values: [...values] };
  const pairs = labels.map((l, i) => [l, values[i]]);
  const mult = order === 'desc' ? -1 : 1;
  pairs.sort((a, b) => mult * (Number(b[1]) - Number(a[1])));
  return {
    labels: pairs.map((p) => p[0]),
    values: pairs.map((p) => p[1]),
  };
}
