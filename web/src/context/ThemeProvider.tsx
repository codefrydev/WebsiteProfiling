
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { syncChartJsDefaultsColor } from '../utils/chartJsDefaults';
import { ThemeContext, type ThemePreference } from './themeContext';
import type { CustomThemeState, TokenMap } from '../lib/themeTokens';
import {
  THEME_STORAGE_KEY,
  applyDomTheme,
  getStoredThemePreference,
  resolveEffectiveDark,
} from './themeUtils';
import {
  applyCustomColors,
  getStoredCustomTheme,
  loadCustomThemeFromDb,
  saveCustomThemeToDb,
} from './customThemeUtils';

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Match SSR default; sync from localStorage after mount to avoid hydration mismatch.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [customTheme, setCustomThemeState] = useState<CustomThemeState>({ light: {}, dark: {} });

  useEffect(() => {
    const pref = getStoredThemePreference();
    setPreferenceState(pref);

    // Apply localStorage immediately for zero-flicker (DB load below will sync if different)
    const localStored = getStoredCustomTheme();
    setCustomThemeState(localStored);
    applyCustomColors(resolveEffectiveDark(pref), localStored);

    // Then load from DB — overrides localStorage if DB has a newer/different value
    void loadCustomThemeFromDb().then((dbState) => {
      if (!dbState) return;
      setCustomThemeState(dbState);
      // Also update localStorage so the FOUC script stays fresh
      try {
        localStorage.setItem('wp-theme-custom:v1', JSON.stringify(dbState));
      } catch { /* ignore */ }
      applyCustomColors(resolveEffectiveDark(getStoredThemePreference()), dbState);
    });
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

  // Re-apply custom colors whenever effective dark mode changes
  useEffect(() => {
    applyDomTheme(preference);
    syncChartJsDefaultsColor();
    setCustomThemeState((current) => {
      applyCustomColors(resolveEffectiveDark(preference), current);
      return current;
    });
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyDomTheme('system');
      setCustomThemeState((current) => {
        applyCustomColors(resolveEffectiveDark('system'), current);
        return current;
      });
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  /** Persist state to DB + localStorage and re-apply CSS vars. */
  const persistAndApply = useCallback(
    (next: CustomThemeState) => {
      setCustomThemeState(next);
      void saveCustomThemeToDb(next);
      applyCustomColors(resolveEffectiveDark(preference), next);
    },
    [preference],
  );

  const setCustomToken = useCallback(
    (dark: boolean, cssVar: string, value: string) => {
      setCustomThemeState((current) => {
        const modeKey = dark ? 'dark' : 'light';
        const next: CustomThemeState = {
          ...current,
          [modeKey]: { ...current[modeKey], [cssVar]: value },
        };
        void saveCustomThemeToDb(next);
        applyCustomColors(resolveEffectiveDark(preference), next);
        return next;
      });
    },
    [preference],
  );

  const resetCustomToken = useCallback(
    (dark: boolean, cssVar: string) => {
      setCustomThemeState((current) => {
        const modeKey = dark ? 'dark' : 'light';
        const updated = { ...current[modeKey] };
        delete updated[cssVar];
        const next: CustomThemeState = { ...current, [modeKey]: updated };
        void saveCustomThemeToDb(next);
        applyCustomColors(resolveEffectiveDark(preference), next);
        return next;
      });
    },
    [preference],
  );

  const setCustomModeMap = useCallback(
    (_dark: boolean, map: TokenMap) => {
      setCustomThemeState((current) => {
        const modeKey = _dark ? 'dark' : 'light';
        const next: CustomThemeState = { ...current, [modeKey]: { ...map } };
        persistAndApply(next);
        return next;
      });
    },
    [persistAndApply],
  );

  const resetCustomMode = useCallback(
    (_dark: boolean) => {
      setCustomThemeState((current) => {
        const modeKey = _dark ? 'dark' : 'light';
        const next: CustomThemeState = { ...current, [modeKey]: {} };
        persistAndApply(next);
        return next;
      });
    },
    [persistAndApply],
  );

  const value = useMemo(
    () => ({
      preference,
      setPreference,
      effectiveDark: resolveEffectiveDark(preference),
      customTheme,
      setCustomToken,
      resetCustomToken,
      setCustomModeMap,
      resetCustomMode,
    }),
    [
      preference,
      setPreference,
      customTheme,
      setCustomToken,
      resetCustomToken,
      setCustomModeMap,
      resetCustomMode,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
