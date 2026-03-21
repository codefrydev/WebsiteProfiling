/**
 * Singleton module worker for browser assistant chat — keeps ONNX/WASM off the main thread.
 */

let workerInstance = null;

function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../workers/mlChatWorker.js', import.meta.url), { type: 'module' });
    workerInstance.addEventListener('error', (e) => {
      console.error('[mlChatWorker]', e.message || e);
    });
  }
  return workerInstance;
}

function rafThrottle(fn) {
  let raf = null;
  let latest = null;
  return (arg) => {
    latest = arg;
    if (raf != null) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      fn(latest);
    });
  };
}

/**
 * @param {{
 *   modelId: string,
 *   thread: Array<{ role: string, content: string }>,
 *   genOptions: Record<string, unknown>,
 *   onProgress?: (u: { overall?: number, currentFile?: string, bytesLine?: string }) => void,
 *   onStream?: (text: string) => void,
 *   onModelCached?: () => void,
 * }} opts
 */
export function runChatInWorker({ modelId, thread, genOptions, onProgress, onStream, onModelCached }) {
  const throttledProgress = onProgress ? rafThrottle(onProgress) : null;
  const throttledStream = onStream ? rafThrottle(onStream) : null;

  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const worker = getWorker();

    const handler = (ev) => {
      const d = ev.data;
      if (!d || d.id !== id) return;
      if (d.type === 'progress') {
        throttledProgress?.(d.payload);
        return;
      }
      if (d.type === 'stream') {
        throttledStream?.(d.text);
        return;
      }
      if (d.type === 'modelCached') {
        onModelCached?.();
        return;
      }
      if (d.type === 'done') {
        worker.removeEventListener('message', handler);
        resolve(d.result);
        return;
      }
      if (d.type === 'error') {
        worker.removeEventListener('message', handler);
        const err = new Error(d.error?.message || 'Worker error');
        if (d.error?.name) err.name = d.error.name;
        if (d.error?.stack) err.stack = d.error.stack;
        reject(err);
      }
    };

    worker.addEventListener('message', handler);
    try {
      worker.postMessage({ id, modelId, thread, genOptions });
    } catch (e) {
      worker.removeEventListener('message', handler);
      reject(e);
    }
  });
}

