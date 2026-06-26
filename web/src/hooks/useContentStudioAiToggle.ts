
import { useCallback, useEffect, useState } from 'react';
import { getCachedClientPreferences, initClientPreferences, patchClientPreferences } from '@/lib/clientPreferences';

export function useContentStudioAiToggle(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useState(() => getCachedClientPreferences().contentStudioAiEnabled);

  useEffect(() => {
    void initClientPreferences().then((prefs) => {
      setEnabled(prefs.contentStudioAiEnabled);
    });
  }, []);

  const set = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem('content-studio-ai-enabled', value ? '1' : '0');
    } catch {
      /* ignore */
    }
    patchClientPreferences({ contentStudioAiEnabled: value });
  }, []);

  return [enabled, set];
}
