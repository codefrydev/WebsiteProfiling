import { scoreBandColor } from './chartPalette';

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
  if (value == null || value === '') return '—';
  const v = Number(value);
  if (key === 'cls') return v === 0 ? '0' : v.toFixed(2);
  if (['lcp_ms', 'fcp_ms', 'speed_index_ms'].includes(key)) {
    return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
  }
  if (key === 'tbt_ms') return `${Math.round(v)} ms`;
  return String(value);
}

// ─── Metric thresholds & status ───────────────────────────────────────────────

export const METRIC_THRESHOLDS = {
  fcp_ms:         { good: 1800, warn: 3000, label: 'First Contentful Paint',   desc: 'Time until first text/image is painted. Aim for under 1.8 s.' },
  lcp_ms:         { good: 2500, warn: 4000, label: 'Largest Contentful Paint', desc: 'Time for the largest visible element to render. Core Web Vital. Target ≤2.5 s.' },
  tbt_ms:         { good: 200,  warn: 600,  label: 'Total Blocking Time',      desc: 'Total time main thread was blocked during load. Target ≤200 ms.' },
  cls:            { good: 0.1,  warn: 0.25, label: 'Cumulative Layout Shift',  desc: 'Measures visual stability — unexpected layout shifts. Target ≤0.1.' },
  speed_index_ms: { good: 3400, warn: 5800, label: 'Speed Index',              desc: 'How quickly content visually appears during load. Target ≤3.4 s.' },
};

export function metricStatus(key, value) {
  if (value == null) return 'neutral';
  const v = Number(value);
  const t = METRIC_THRESHOLDS[key];
  if (!t) return 'neutral';
  return v <= t.good ? 'good' : v <= t.warn ? 'warn' : 'poor';
}

// ─── Category & impact group constants ───────────────────────────────────────

export const CATEGORIES = [
  { id: 'performance',    label: 'Performance' },
  { id: 'accessibility',  label: 'Accessibility' },
  { id: 'best-practices', label: 'Best Practices' },
  { id: 'seo',            label: 'SEO' },
  { id: 'pwa',            label: 'PWA' },
];

export const CATEGORY_LABELS = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best practices',
  seo: 'SEO',
  pwa: 'PWA',
};

export const IMPACT_GROUPS = [
  { id: 'LCP',           label: 'LCP',                color: 'text-blue-400',   border: 'border-blue-700/40' },
  { id: 'CLS',           label: 'CLS',                color: 'text-purple-400', border: 'border-purple-700/40' },
  { id: 'TBT',           label: 'TBT / FID',          color: 'text-yellow-400', border: 'border-yellow-700/40' },
  { id: 'Accessibility', label: 'Accessibility',      color: 'text-teal-400',   border: 'border-teal-700/40' },
  { id: 'SEO',           label: 'SEO',                color: 'text-green-400',  border: 'border-green-700/40' },
  { id: 'UX',            label: 'Best Practices / UX',color: 'text-orange-400', border: 'border-orange-700/40' },
];

// ─── Quick wins data (icons omitted — added by QuickWinCard at render time) ──
// iconKey maps to a lucide icon name; the component resolves it.

export const QUICK_WINS = [
  {
    id: 'preload-lcp',
    iconKey: 'Zap',
    title: 'Preload LCP image',
    why: 'Preloading the LCP image resource reduces render-blocking, shaving hundreds of ms from LCP.',
    how: 'Add <link rel="preload" as="image" href="..."> in <head> for the above-the-fold hero image.',
    impact: 'High — directly improves LCP score',
    auditIds: ['uses-rel-preload', 'prioritize-lcp-image'],
  },
  {
    id: 'image-dims',
    iconKey: 'Image',
    title: 'Add width/height to images',
    why: 'Missing dimensions cause the browser to reflow layout when images load, increasing CLS.',
    how: 'Set explicit width and height attributes on all <img> elements.',
    impact: 'High — directly reduces CLS',
    auditIds: ['unsized-images'],
  },
  {
    id: 'defer-js',
    iconKey: 'Code2',
    title: 'Defer non-critical JavaScript',
    why: 'Render-blocking scripts delay FCP and LCP. Deferring them frees the main thread.',
    how: 'Add defer or async attribute to <script> tags not needed for initial render.',
    impact: 'High — reduces TBT and LCP',
    auditIds: ['render-blocking-resources', 'unused-javascript'],
  },
  {
    id: 'compress-images',
    iconKey: 'Image',
    title: 'Compress images to WebP/AVIF',
    why: 'Modern formats are 25–50% smaller than JPEG/PNG with equal quality, reducing bytes downloaded.',
    how: 'Convert images to WebP or AVIF using <picture> with srcset, or serve via CDN with format negotiation.',
    impact: 'Medium — faster LCP and lower byte count',
    auditIds: ['modern-image-formats', 'uses-optimized-images'],
  },
  {
    id: 'cache-control',
    iconKey: 'Clock',
    title: 'Set Cache-Control headers',
    why: 'Properly cached resources are served from disk on repeat visits, vastly reducing load time.',
    how: 'Set Cache-Control: public, max-age=31536000, immutable for hashed assets; use short TTLs for HTML.',
    impact: 'Medium — major speedup for repeat visitors',
    auditIds: ['uses-long-cache-ttl'],
  },
  {
    id: 'meta-desc',
    iconKey: 'Search',
    title: 'Add meta description',
    why: 'Meta descriptions improve click-through rate from search results and are used by Lighthouse SEO.',
    how: 'Add <meta name="description" content="..."> (70–160 chars) to every page.',
    impact: 'Medium — SEO score improvement',
    auditIds: ['meta-description'],
  },
  {
    id: 'text-compression',
    iconKey: 'Zap',
    title: 'Enable text compression',
    why: 'Gzip or Brotli can reduce HTML/CSS/JS byte sizes by 60–80%, speeding up downloads.',
    how: 'Enable Gzip or Brotli compression on your server / CDN for text-based content types.',
    impact: 'High — directly reduces FCP and LCP',
    auditIds: ['uses-text-compression'],
  },
  {
    id: 'unused-js',
    iconKey: 'Code2',
    title: 'Reduce unused JavaScript',
    why: 'Unused code wastes bandwidth and parsing time, increasing TBT and FCP.',
    how: 'Use tree-shaking in your bundler; split large bundles with dynamic import(); remove dead code.',
    impact: 'Medium — reduces TBT',
    auditIds: ['unused-javascript'],
  },
  {
    id: 'minify-css',
    iconKey: 'Code2',
    title: 'Minify CSS',
    why: 'Unminified CSS wastes bytes and can be render-blocking.',
    how: 'Use a CSS minifier (e.g. cssnano, lightningcss) in your build pipeline.',
    impact: 'Low–Medium — marginal FCP improvement',
    auditIds: ['unminified-css'],
  },
  {
    id: 'hsts',
    iconKey: 'Shield',
    title: 'Enable HSTS',
    why: 'HSTS forces HTTPS connections and earns a Best Practices point in Lighthouse.',
    how: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains to your server config.',
    impact: 'Low — Best Practices score',
    auditIds: [],
  },
];
