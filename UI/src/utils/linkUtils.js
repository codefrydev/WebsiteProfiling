import { strings } from '../lib/strings.js';

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatLhMetric(key, value) {
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

export function formatMs(ms) {
  if (ms == null || ms === '') return strings.common.emDash;
  const v = Number(ms);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

/** Host + path for table display (full URL in title/href). */
export function formatPageHrefLines(url) {
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

export function rtColor(ms) {
  if (ms == null || ms === 0) return 'text-slate-400';
  if (ms < 500) return 'text-green-400';
  if (ms <= 2000) return 'text-yellow-400';
  return 'text-red-400';
}

export function wcLabel(wc) {
  if (wc < 300) return { label: strings.common.wcThin, color: 'text-red-400' };
  if (wc < 1000) return { label: strings.common.wcMedium, color: 'text-yellow-400' };
  return { label: strings.common.wcLong, color: 'text-green-400' };
}

export function readingLabel(rl) {
  if (rl <= 5) return { label: strings.common.rlElementary, color: 'text-green-400' };
  if (rl <= 8) return { label: strings.common.rlMiddle, color: 'text-blue-400' };
  if (rl <= 12) return { label: strings.common.rlHighSchool, color: 'text-yellow-400' };
  return { label: strings.common.rlCollege, color: 'text-red-400' };
}

export function titleCharColor(len) {
  if (len === 0) return 'bg-red-500';
  if (len < 30) return 'bg-yellow-500';
  if (len <= 60) return 'bg-green-500';
  return 'bg-red-500';
}

export function metaCharColor(len) {
  if (len === 0) return 'bg-red-500';
  if (len >= 70 && len <= 160) return 'bg-green-500';
  if (len > 160) return 'bg-red-500';
  return 'bg-yellow-500';
}

export function severityBg(s) {
  if (!s) return 'bg-slate-700 text-slate-300';
  const sl = s.toLowerCase();
  if (sl === 'critical') return 'bg-red-500/20 text-red-300';
  if (sl === 'high') return 'bg-orange-500/20 text-orange-300';
  if (sl === 'medium') return 'bg-yellow-500/20 text-yellow-300';
  return 'bg-slate-700/60 text-slate-400';
}

// ─── JSON parsers ─────────────────────────────────────────────────────────────

export function parseTechStack(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function parseKeywords(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/**
 * Normalise a single keyword entry which may come in three shapes:
 *   ["word", 5]        → { word: "word", count: 5 }
 *   { word, count }    → { word: "word", count: 5 }
 *   "word"             → { word: "word", count: null }
 */
export function normaliseKw(kw) {
  if (Array.isArray(kw)) {
    return { word: String(kw[0] ?? ''), count: kw[1] ?? null, score: kw[2] ?? null };
  }
  if (kw && typeof kw === 'object') {
    return {
      word: String(kw.word ?? kw.text ?? kw.term ?? ''),
      count: kw.count ?? kw.freq ?? null,
      score: kw.score ?? null,
    };
  }
  return { word: String(kw ?? ''), count: null };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SELECT_CLASS = 'bg-brand-800 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 outline-none';

export const CONTENT_URL_KEYS = strings.linkExplorer.contentUrlKeys;

export const CONTENT_LABELS = strings.linkExplorer.contentLabels;

export const CONTENT_RECOMMENDATIONS = strings.linkExplorer.contentRecommendations;

export const SEO_ISSUE_RECOMMENDATIONS = strings.linkExplorer.seoIssueRecommendations;
