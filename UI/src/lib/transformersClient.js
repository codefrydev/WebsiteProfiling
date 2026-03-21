/**
 * Cached @xenova/transformers pipelines with optional download progress.
 * Models load once per session (per task+model key).
 */

const pipelinePromises = new Map();

function cacheKey(task, modelId) {
  return `${task}::${modelId}`;
}

/**
 * @param {'feature-extraction'|'zero-shot-classification'|'text-classification'} task
 * @param {string} modelId e.g. Xenova/all-MiniLM-L6-v2
 * @param {{ quantized?: boolean, progressCallback?: (info: object) => void }} [options]
 */
export async function loadPipeline(task, modelId, options = {}) {
  const key = cacheKey(task, modelId);
  if (pipelinePromises.has(key)) {
    return pipelinePromises.get(key);
  }
  const promise = (async () => {
    const { pipeline } = await import('@xenova/transformers');
    return pipeline(task, modelId, {
      quantized: options.quantized !== false,
      progress_callback: options.progressCallback,
    });
  })();
  pipelinePromises.set(key, promise);
  return promise;
}

/** Default embedding model (aligned with Python sentence-transformers MiniLM). */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

export const MODEL_LABELS = {
  embedding: DEFAULT_EMBEDDING_MODEL,
  zeroShot: 'Xenova/distilbert-base-uncased-mnli',
  sentiment: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
};

/**
 * Aggregate Xenova progress_callback events into a simple 0–100 progress and status line.
 * Multiple files may download; we show the latest file and a coarse overall percent.
 */
export function createProgressAggregator(onUpdate) {
  const files = new Map();
  return (info) => {
    if (!info || typeof info !== 'object') return;
    const file = info.file || info.name || '';
    const status = info.status || '';
    if (file) {
      const prev = files.get(file) || { loaded: 0, total: 0 };
      if (typeof info.progress === 'number' && !Number.isNaN(info.progress)) {
        prev.pct = info.progress;
      }
      if (info.loaded != null && info.total != null) {
        prev.loaded = info.loaded;
        prev.total = info.total;
        if (info.total > 0) {
          prev.pct = (info.loaded / info.total) * 100;
        }
      }
      files.set(file, prev);
    }
    let sum = 0;
    let count = 0;
    for (const v of files.values()) {
      if (typeof v.pct === 'number') {
        sum += Math.min(100, Math.max(0, v.pct));
        count += 1;
      }
    }
    const overall = count ? Math.round(sum / count) : status === 'done' ? 100 : 0;
    const fileList = [...files.keys()];
    const label =
      fileList.length === 0
        ? status || 'loading'
        : `${fileList[fileList.length - 1].split('/').pop() || 'model'}${count > 1 ? ` (+${count - 1} files)` : ''}`;
    onUpdate?.({
      overall,
      status: String(status),
      currentFile: label,
      raw: info,
    });
  };
}

export { combinePageText, vecFromOutput, cosineSim } from './embeddingUtils.js';
