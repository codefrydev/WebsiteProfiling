/**
 * Resolve chart theme colors from the app's CSS variables (so dashboards match
 * Lighthouse / Overview and follow dark/light + custom accent at runtime).
 * Reuses the shared categorical palette.
 */
import { PALETTE_CATEGORICAL } from '@/utils/chartPalette';

export interface ChartTheme {
  colors: string[];
  text: string;
  axis: string;
  split: string;
  tooltipBg: string;
  tooltipText: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const PALETTES: Record<string, string[]> = {
  default: PALETTE_CATEGORICAL,
  cool: ['#4C72B0', '#6B8E9F', '#55A868', '#8172B3', '#3B82F6', '#06B6D4', '#0EA5E9', '#14B8A6'],
  warm: ['#DD8452', '#C44E52', '#EAB308', '#F97316', '#EF4444', '#F59E0B', '#FB923C', '#937860'],
  mono: ['#4C72B0', '#6E86B8', '#8F9BC0', '#3A5C95', '#5A77AE', '#7E93C2', '#2E4E86', '#9FAFD0'],
};

export function buildChartTheme(paletteId?: string): ChartTheme {
  return {
    colors: PALETTES[paletteId ?? 'default'] ?? PALETTE_CATEGORICAL,
    text: cssVar('--app-text', '#334155'),
    axis: cssVar('--chart-grid', 'rgba(148,163,184,0.4)'),
    split: cssVar('--chart-grid', 'rgba(148,163,184,0.2)'),
    tooltipBg: cssVar('--app-bg-elevated', '#111827'),
    tooltipText: cssVar('--app-text-heading', '#e5e7eb'),
  };
}

export const PALETTE_IDS = Object.keys(PALETTES);
