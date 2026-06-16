'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'content-studio-ai-enabled';

export function useContentStudioAiToggle(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === '0') setEnabled(false);
      else if (raw === '1') setEnabled(true);
    } catch {
      /* ignore */
    }
  }, []);

  const set = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  return [enabled, set];
}
