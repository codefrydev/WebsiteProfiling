import { strings } from '../lib/strings';

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatLhMetric(key: string, value: unknown): string {
  if (value == null || value === '') return strings.common.emDash;
  const v = Number(value);
  if (key === 'cls') return v === 0 ? '0' : v.toFixed(2);
  if (key === 'lcp_ms' || key === 'fcp_ms' || key === 'speed_index_ms') {
    if (v >= 1000) return `${(v / 1000).toFixed(1)} s`;
    return `${Math.round(v)} ms`;
  }
  if (key === 'tbt_ms') return `${Math.round(v)} ms`;
  return String(value);
}

export function formatMs(ms: unknown): string {
  if (ms == null || ms === '') return strings.common.emDash;
  const v = Number(ms);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

export interface PageHrefLines {
  label: string;
  full: string;
}

/** Host + path for table display (full URL in title/href). */
export function formatPageHrefLines(url: string | null | undefined): PageHrefLines {
  if (!url || typeof url !== 'string') return { label: '', full: '' };
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname || '/';
    const q = u.search || '';
    return { label: `${host}${path}${q}`, full: url };
  } catch {
    return { label: url, full: url };
  }
}

// ─── Color helpers ────────────────────────────────────────────────────────────

export interface LabelColor {
  label: string;
  color: string;
}

export function rtColor(ms: unknown): string {
  if (ms == null || ms === 0) return 'text-md-sys-on-surface-variant';
  const n = Number(ms);
  if (n < 500) return 'text-md-sys-success';
  if (n <= 2000) return 'text-md-sys-warning';
  return 'text-md-sys-error';
}

/** Relative bar width for inlinks vs max in current result set (0–100). */
export function inlinksBarWidthPct(count: number, maxInSection: number): number {
  const n = Math.max(0, Number(count) || 0);
  const max = Math.max(0, Number(maxInSection) || 0);
  if (n <= 0 || max <= 0) return 0;
  return Math.min(100, (n / max) * 100);
}

/** Text emphasis for inlinks count — muted at zero, primary accent when strong. */
export function inlinksTextClass(count: number, maxInSection: number): string {
  const n = Math.max(0, Number(count) || 0);
  if (n === 0) return 'text-md-sys-on-surface-variant font-normal';
  const ratio = maxInSection > 0 ? n / maxInSection : 0;
  if (ratio >= 0.66) return 'text-md-sys-primary font-semibold';
  if (ratio >= 0.33) return 'text-md-sys-primary/80 font-medium';
  return 'text-md-sys-on-surface font-medium';
}

export function wcLabel(wc: number): LabelColor {
  if (wc < 300) return { label: strings.common.wcThin, color: 'text-md-sys-error' };
  if (wc < 1000) return { label: strings.common.wcMedium, color: 'text-md-sys-warning' };
  return { label: strings.common.wcLong, color: 'text-md-sys-success' };
}

export function readingLabel(rl: number): LabelColor {
  if (rl <= 5) return { label: strings.common.rlElementary, color: 'text-md-sys-success' };
  if (rl <= 8) return { label: strings.common.rlMiddle, color: 'text-md-sys-primary' };
  if (rl <= 12) return { label: strings.common.rlHighSchool, color: 'text-md-sys-warning' };
  return { label: strings.common.rlCollege, color: 'text-md-sys-error' };
}

export function titleCharColor(len: number): string {
  if (len === 0) return 'bg-md-sys-error';
  if (len < 30) return 'bg-md-sys-warning';
  if (len <= 60) return 'bg-md-sys-success';
  return 'bg-md-sys-error';
}

export function metaCharColor(len: number): string {
  if (len === 0) return 'bg-md-sys-error';
  if (len >= 70 && len <= 160) return 'bg-md-sys-success';
  if (len > 160) return 'bg-md-sys-error';
  return 'bg-md-sys-warning';
}

export function severityBg(s: string | null | undefined): string {
  if (!s) return 'bg-md-sys-surface-container-high text-md-sys-on-surface';
  const sl = s.toLowerCase();
  if (sl === 'critical') return 'bg-md-sys-error-container text-md-sys-on-error-container border border-md-sys-error/30';
  if (sl === 'high') return 'bg-md-sys-error-container/60 text-md-sys-on-error-container border border-md-sys-error/20';
  if (sl === 'medium') return 'bg-md-sys-tertiary-container text-md-sys-on-tertiary-container border border-md-sys-tertiary/30';
  return 'bg-md-sys-surface-container-high/60 text-md-sys-on-surface-variant';
}

// ─── JSON parsers ─────────────────────────────────────────────────────────────

export function parseTechStack(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as unknown[]; } catch { return []; }
}

export function parseKeywords(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as unknown[]; } catch { return []; }
}

export interface NormalisedKeyword {
  word: string;
  count: number | null;
  score?: number | null;
}

/**
 * Normalise a single keyword entry which may come in three shapes:
 *   ["word", 5]        → { word: "word", count: 5 }
 *   { word, count }    → { word: "word", count: 5 }
 *   "word"             → { word: "word", count: null }
 */
export function normaliseKw(kw: unknown): NormalisedKeyword {
  if (Array.isArray(kw)) {
    return { word: String(kw[0] ?? ''), count: (kw[1] as number | null | undefined) ?? null, score: (kw[2] as number | null | undefined) ?? null };
  }
  if (kw && typeof kw === 'object') {
    const obj = kw as Record<string, unknown>;
    return {
      word: String(obj.word ?? obj.text ?? obj.term ?? ''),
      count: (obj.count ?? obj.freq ?? null) as number | null,
      score: (obj.score ?? null) as number | null,
    };
  }
  return { word: String(kw ?? ''), count: null };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** @deprecated Import Select or SELECT_CLASS from @/components/Select */
export { SELECT_CLASS } from '@/components/Select';

export const CONTENT_URL_KEYS = strings.linkExplorer.contentUrlKeys;

export const CONTENT_LABELS = strings.linkExplorer.contentLabels;

export const CONTENT_RECOMMENDATIONS = strings.linkExplorer.contentRecommendations;

export const SEO_ISSUE_RECOMMENDATIONS = strings.linkExplorer.seoIssueRecommendations;
