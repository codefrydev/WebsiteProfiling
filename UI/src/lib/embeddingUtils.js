/**
 * Shared helpers for Transformers.js embeddings and similarity (browser).
 */

export function combinePageText(linkLike, maxLen = 4000) {
  const t = [linkLike?.title, linkLike?.h1, linkLike?.meta_description, linkLike?.content_excerpt]
    .filter(Boolean)
    .join(' ')
    .trim();
  return t.slice(0, maxLen);
}

export function vecFromOutput(out) {
  if (!out) return null;
  if (out.data) return Array.from(out.data);
  if (out instanceof Float32Array) return Array.from(out);
  if (Array.isArray(out)) return out;
  return null;
}

export function cosineSim(a, b) {
  if (!a?.length || !b?.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}
