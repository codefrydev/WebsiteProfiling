import { useCallback, useEffect, useMemo, useState } from 'react';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults.js';
import { ThemeContext } from './themeContext.js';
import {
  THEME_STORAGE_KEY,
  applyDomTheme,
  getStoredThemePreference,
  resolveEffectiveDark,
} from './themeUtils.js';

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() =>
    typeof window !== 'undefined' ? getStoredThemePreference() : 'system',
  );

  const setPreference = useCallback((next) => {
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
