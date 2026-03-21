import { scoreBandColor } from './chartPalette';
import { strings } from '../lib/strings.js';

// ─── Score color helpers ──────────────────────────────────────────────────────

export function scoreColor(score) {
  return scoreBandColor(score);
}

export function scoreRingColor(score) {
  if (score == null) return 'rgb(51, 65, 85)';
  return scoreColor(score);
}

// ─── Metric formatter ─────────────────────────────────────────────────────────

export function formatMetric(key, value) {
  if (value == null || value === '') return strings.common.emDash;
  const v = Number(value);
  if (key === 'cls') return v === 0 ? '0' : v.toFixed(2);
  if (['lcp_ms', 'fcp_ms', 'speed_index_ms'].includes(key)) {
    return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
  }
  if (key === 'tbt_ms') return `${Math.round(v)} ms`;
  return String(value);
}

// ─── Metric thresholds & status ───────────────────────────────────────────────

export const METRIC_THRESHOLDS = strings.lighthouse.metricThresholds;

export function metricStatus(key, value) {
  if (value == null) return 'neutral';
  const v = Number(value);
  const t = METRIC_THRESHOLDS[key];
  if (!t) return 'neutral';
  return v <= t.good ? 'good' : v <= t.warn ? 'warn' : 'poor';
}

// ─── Category & impact group constants ───────────────────────────────────────

export const CATEGORIES = strings.lighthouse.categories;

export const CATEGORY_LABELS = strings.lighthouse.categoryLabels;

export const IMPACT_GROUPS = strings.lighthouse.impactGroups;

export const QUICK_WINS = strings.lighthouse.quickWins;
