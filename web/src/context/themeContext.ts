import { createContext } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  effectiveDark: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
