/**
 * Cached @xenova/transformers pipelines with optional download progress.
 * Models load once per session (per task+model key).
 */

const pipelinePromises = new Map();
/** Keys whose pipeline promise has resolved successfully (not merely in-flight). */
const resolvedPipelineKeys = new Set();

function cacheKey(task, modelId) {
  return `${task}::${modelId}`;
}

/** True after the pipeline finished loading at least once in this JS realm (worker vs main each have their own cache). */
export function isPipelineReady(task, modelId) {
  return resolvedPipelineKeys.has(cacheKey(task, modelId));
}

/**
 * @param {'feature-extraction'|'text-generation'} task
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
    const p = await pipeline(task, modelId, {
      quantized: options.quantized !== false,
      progress_callback: options.progressCallback,
    });
    resolvedPipelineKeys.add(key);
    return p;
  })();
  pipelinePromises.set(key, promise);
  return promise;
}

/** Default embedding model (aligned with Python sentence-transformers MiniLM). */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

export const MODEL_LABELS = {
  embedding: DEFAULT_EMBEDDING_MODEL,
  /** Chat via tokenizer `apply_chat_template` (see @xenova/transformers TextGenerationPipeline). Smaller than 1.1B to reduce WASM memory pressure. */
  chat: 'Xenova/Qwen1.5-0.5B-Chat',
};

/** @param {number} bytes */
export function formatBytesMb(bytes) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0.0';
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? mb.toFixed(0) : mb.toFixed(1);
}

/**
 * Aggregate Xenova progress_callback events into a simple 0–100 progress, status line, and transfer size.
 * Sums `loaded` / `total` across files (see hub.js readResponse).
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

    if (status === 'done' && file) {
      const prev = files.get(file) || { loaded: 0, total: 0 };
      if (prev.total > 0) {
        prev.loaded = prev.total;
        prev.pct = 100;
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

    let bytesLoaded = 0;
    let bytesTotal = 0;
    for (const v of files.values()) {
      if (typeof v.loaded === 'number') bytesLoaded += v.loaded;
      if (typeof v.total === 'number' && v.total > 0) bytesTotal += v.total;
    }

    let bytesLine = '';
    if (bytesLoaded > 0) {
      const mbL = bytesLoaded / (1024 * 1024);
      if (mbL < 0.01 && bytesTotal <= 0) {
        bytesLine = `${(bytesLoaded / 1024).toFixed(0)} KB`;
      } else if (bytesTotal > 0 && bytesTotal >= bytesLoaded) {
        bytesLine = `${formatBytesMb(bytesLoaded)} / ${formatBytesMb(bytesTotal)} MB`;
      } else {
        bytesLine = `${formatBytesMb(bytesLoaded)} MB`;
      }
    }

    onUpdate?.({
      overall,
      status: String(status),
      currentFile: label,
      bytesLine,
      bytesLoaded,
      bytesTotal,
      raw: info,
    });
  };
}

export { combinePageText, vecFromOutput, cosineSim } from './embeddingUtils.js';
