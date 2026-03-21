import { queryCrawlResults } from './loadReportDb';
import {
  loadPipeline,
  DEFAULT_EMBEDDING_MODEL,
  createProgressAggregator,
  combinePageText,
  vecFromOutput,
  cosineSim,
} from './transformersClient';

/**
 * @param {{
 *   link: Record<string, unknown>,
 *   allLinks: unknown[],
 *   sqlDb: import('sql.js').Database | null,
 *   onProgress?: (u: { overall: number, currentFile: string, bytesLine?: string }) => void,
 * }} opts
 * @returns {Promise<{ rows: Array<{ url: string, title: string, score: number, source?: string }>, error: string | null }>}
 */
export async function runBrowserSimilarity({ link, allLinks, sqlDb, onProgress }) {
  const list = Array.isArray(allLinks) ? allLinks : [];
  const u = (link?.url || '').replace(/\/$/, '');
  const candidates = list
    .filter((l) => l?.url && String(l.status || '').startsWith('2'))
    .filter((l) => (l.url || '').replace(/\/$/, '') !== u)
    .slice(0, 100);

  const progressCallback = onProgress
    ? createProgressAggregator((info) =>
        onProgress({
          overall: info.overall,
          currentFile: info.currentFile || '',
          bytesLine: info.bytesLine || '',
        })
      )
    : undefined;

  const extractor = await loadPipeline('feature-extraction', DEFAULT_EMBEDDING_MODEL, {
    progressCallback,
  });
  const baseText = combinePageText(link, 4000);
  if (baseText.length < 8) {
    return { rows: [], error: 'notEnoughText' };
  }
  const baseOut = await extractor(baseText, { pooling: 'mean', normalize: true });
  const baseVec = vecFromOutput(baseOut);
  if (!baseVec) {
    return { rows: [], error: 'noEmbedding' };
  }

  const scored = [];
  const seen = new Set([u]);

  for (const c of candidates) {
    const t = combinePageText(c, 4000);
    if (t.length < 8) continue;
    const o = await extractor(t, { pooling: 'mean', normalize: true });
    const v = vecFromOutput(o);
    if (!v) continue;
    scored.push({ url: c.url, title: c.title || c.url, score: cosineSim(baseVec, v) });
  }

  if (sqlDb) {
    const extra = queryCrawlResults(sqlDb, 120);
    for (const row of extra) {
      const url = (row.url || '').replace(/\/$/, '');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const t = combinePageText(row, 4000);
      if (t.length < 8) continue;
      const o = await extractor(t, { pooling: 'mean', normalize: true });
      const v = vecFromOutput(o);
      if (!v) continue;
      scored.push({ url: row.url, title: row.title || row.url, score: cosineSim(baseVec, v), source: 'sql' });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return { rows: scored.slice(0, 12), error: null };
}

export { DEFAULT_EMBEDDING_MODEL };
