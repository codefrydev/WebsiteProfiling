// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatLhMetric(key, value) {
  if (value == null || value === '') return '—';
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
  if (ms == null || ms === '') return '—';
  const v = Number(ms);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

export function rtColor(ms) {
  if (ms == null || ms === 0) return 'text-slate-400';
  if (ms < 500) return 'text-green-400';
  if (ms <= 2000) return 'text-yellow-400';
  return 'text-red-400';
}

export function wcLabel(wc) {
  if (wc < 300) return { label: 'Thin', color: 'text-red-400' };
  if (wc < 1000) return { label: 'Medium', color: 'text-yellow-400' };
  return { label: 'Long', color: 'text-green-400' };
}

export function readingLabel(rl) {
  if (rl <= 5) return { label: 'Elementary', color: 'text-green-400' };
  if (rl <= 8) return { label: 'Middle', color: 'text-blue-400' };
  if (rl <= 12) return { label: 'High School', color: 'text-yellow-400' };
  return { label: 'College+', color: 'text-red-400' };
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
  if (Array.isArray(kw))  return { word: String(kw[0] ?? ''), count: kw[1] ?? null };
  if (kw && typeof kw === 'object') return { word: String(kw.word ?? kw.text ?? kw.term ?? ''), count: kw.count ?? kw.freq ?? null };
  return { word: String(kw ?? ''), count: null };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SELECT_CLASS = 'bg-brand-800 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 outline-none';

export const CONTENT_URL_KEYS = [
  'missing_h1', 'missing_title', 'multiple_h1', 'missing_meta_desc',
  'meta_desc_short', 'meta_desc_long', 'thin_content',
];

export const CONTENT_LABELS = {
  missing_h1: 'Missing H1',
  missing_title: 'Missing title',
  multiple_h1: 'Multiple H1s',
  missing_meta_desc: 'Missing meta description',
  meta_desc_short: 'Meta description too short',
  meta_desc_long: 'Meta description too long',
  thin_content: 'Thin content',
};

export const CONTENT_RECOMMENDATIONS = {
  missing_h1: 'Add exactly one H1 per page.',
  missing_title: 'Add a unique title (30–60 chars).',
  multiple_h1: 'Use a single H1 per page.',
  missing_meta_desc: 'Add a meta description (70–160 chars).',
  meta_desc_short: 'Aim for 70–160 characters.',
  meta_desc_long: 'Shorten to 70–160 characters.',
  thin_content: 'Expand content to at least 300 characters.',
};

export const SEO_ISSUE_RECOMMENDATIONS = {
  missing_title: 'Add a unique title (30–60 chars).',
  title_short: 'Aim for 30–60 characters.',
  title_long: 'Shorten title to 30–60 characters.',
  meta_desc_short: 'Aim for 70–160 characters.',
  meta_desc_long: 'Shorten to 70–160 characters.',
  h1_missing: 'Add exactly one H1 per page.',
  h1_multi: 'Use a single H1 per page.',
  thin_content: 'Expand content to at least 300 characters.',
};
