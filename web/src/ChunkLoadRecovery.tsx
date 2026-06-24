import { useEffect } from 'react';

const RELOAD_KEY = 'wp-chunk-reload-once';

/**
 * Dev/HMR sometimes serves stale chunk URLs; one automatic reload usually fixes ChunkLoadError.
 */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }

    const onError = (event: ErrorEvent) => {
      const msg = String(event.message || event.error?.message || '');
      if (!/loading chunk|chunkloaderror|failed to fetch dynamically imported module/i.test(msg)) {
        return;
      }
      try {
        if (sessionStorage.getItem(RELOAD_KEY)) return;
        sessionStorage.setItem(RELOAD_KEY, '1');
      } catch {
        /* ignore */
      }
      window.location.reload();
    };

    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, []);

  return null;
}
