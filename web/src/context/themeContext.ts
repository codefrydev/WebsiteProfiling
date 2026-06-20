import { createContext } from 'react';
import type { CustomThemeState, TokenMap } from '../lib/themeTokens';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  effectiveDark: boolean;
  /** Custom per-mode token overrides (persisted in localStorage). */
  customTheme: CustomThemeState;
  /** Update one token in the given mode and persist + apply immediately. */
  setCustomToken: (dark: boolean, cssVar: string, value: string) => void;
  /** Remove one token override in the given mode. */
  resetCustomToken: (dark: boolean, cssVar: string) => void;
  /** Replace the full token map for one mode (e.g. preset apply). */
  setCustomModeMap: (dark: boolean, map: TokenMap) => void;
  /** Clear all overrides for one mode. */
  resetCustomMode: (dark: boolean) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
