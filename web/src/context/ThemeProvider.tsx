'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults';
import { ThemeContext, type ThemePreference } from './themeContext';
import {
  THEME_STORAGE_KEY,
  applyDomTheme,
  getStoredThemePreference,
  resolveEffectiveDark,
} from './themeUtils';

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Match SSR default; sync from localStorage after mount to avoid hydration mismatch.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    setPreferenceState(getStoredThemePreference());
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyDomTheme(next);
  }, []);

  useEffect(() => {
    applyDomTheme(preference);
    syncChartJsDefaultsColor();
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyDomTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      setPreference,
      effectiveDark: resolveEffectiveDark(preference),
    }),
    [preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
