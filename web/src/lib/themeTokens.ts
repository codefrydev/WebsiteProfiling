export interface ThemeToken {
  id: string;
  cssVar: string;
  label: string;
  group: string;
  defaultLight: string;
  defaultDark: string;
}

export type TokenMap = Record<string, string>;

export interface CustomThemeState {
  light: TokenMap;
  dark: TokenMap;
}

export const THEME_TOKENS: ThemeToken[] = [
  // Backgrounds
  { id: 'app-bg', cssVar: '--app-bg', label: 'Page background', group: 'Backgrounds', defaultLight: '#f8fafc', defaultDark: '#0b0f19' },
  { id: 'app-bg-elevated', cssVar: '--app-bg-elevated', label: 'Elevated surface', group: 'Backgrounds', defaultLight: '#ffffff', defaultDark: '#111827' },
  { id: 'app-bg-muted', cssVar: '--app-bg-muted', label: 'Muted surface', group: 'Backgrounds', defaultLight: '#f1f5f9', defaultDark: '#1f2937' },
  { id: 'app-bg-sunken', cssVar: '--app-bg-sunken', label: 'Sunken / image placeholder', group: 'Backgrounds', defaultLight: '#e2e8f0', defaultDark: '#06080f' },
  // Text
  { id: 'app-text', cssVar: '--app-text', label: 'Body text', group: 'Text', defaultLight: '#334155', defaultDark: '#cbd5e1' },
  { id: 'app-text-heading', cssVar: '--app-text-heading', label: 'Heading text', group: 'Text', defaultLight: '#0f172a', defaultDark: '#e2e8f0' },
  { id: 'app-text-subtle', cssVar: '--app-text-subtle', label: 'Subtle / muted text', group: 'Text', defaultLight: '#526077', defaultDark: '#64748b' },
  // Accents
  { id: 'accent', cssVar: '--accent', label: 'Primary accent', group: 'Accents', defaultLight: '#2563eb', defaultDark: '#60a5fa' },
  { id: 'accent-warm', cssVar: '--accent-warm', label: 'Warm accent (orange)', group: 'Accents', defaultLight: '#f97316', defaultDark: '#fb923c' },
  { id: 'accent-2', cssVar: '--accent-2', label: 'Secondary accent (purple)', group: 'Accents', defaultLight: '#8b5cf6', defaultDark: '#a78bfa' },
  // Links
  { id: 'app-link', cssVar: '--app-link', label: 'Link color', group: 'Links', defaultLight: '#1d4ed8', defaultDark: '#60a5fa' },
  { id: 'app-link-soft', cssVar: '--app-link-soft', label: 'Link soft / hover', group: 'Links', defaultLight: '#1e3a8a', defaultDark: '#93c5fd' },
  // Status
  { id: 'color-danger', cssVar: '--color-danger', label: 'Danger / error', group: 'Status', defaultLight: '#ef4444', defaultDark: '#f87171' },
  { id: 'color-warning', cssVar: '--color-warning', label: 'Warning', group: 'Status', defaultLight: '#f59e0b', defaultDark: '#fbbf24' },
  { id: 'color-success', cssVar: '--color-success', label: 'Success', group: 'Status', defaultLight: '#22c55e', defaultDark: '#4ade80' },
  // Chat
  { id: 'chat-header-bg', cssVar: '--chat-header-bg', label: 'Chat header background', group: 'Chat', defaultLight: '#030712', defaultDark: '#030712' },
  { id: 'chat-glow', cssVar: '--chat-glow', label: 'Chat ambient glow', group: 'Chat', defaultLight: 'rgba(66,97,255,0.08)', defaultDark: 'rgba(37,99,235,0.06)' },
];

export const TOKEN_GROUPS = [...new Set(THEME_TOKENS.map((t) => t.group))];

export const TOKEN_BY_ID = Object.fromEntries(THEME_TOKENS.map((t) => [t.id, t]));

export function defaultMapForMode(dark: boolean): TokenMap {
  return Object.fromEntries(
    THEME_TOKENS.map((t) => [t.cssVar, dark ? t.defaultDark : t.defaultLight]),
  );
}

// ─── Named presets ───────────────────────────────────────────────────────────

export interface ThemePreset {
  id: string;
  label: string;
  light: TokenMap;
  dark: TokenMap;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    label: 'Default',
    light: {
      '--app-bg': '#f8fafc',
      '--app-bg-elevated': '#ffffff',
      '--app-bg-muted': '#f1f5f9',
      '--app-bg-sunken': '#e2e8f0',
      '--app-text': '#334155',
      '--app-text-heading': '#0f172a',
      '--app-text-subtle': '#526077',
      '--accent': '#2563eb',
      '--accent-warm': '#f97316',
      '--accent-2': '#8b5cf6',
      '--app-link': '#1d4ed8',
      '--app-link-soft': '#1e3a8a',
    },
    dark: {
      '--app-bg': '#0b0f19',
      '--app-bg-elevated': '#111827',
      '--app-bg-muted': '#1f2937',
      '--app-bg-sunken': '#06080f',
      '--app-text': '#cbd5e1',
      '--app-text-heading': '#e2e8f0',
      '--app-text-subtle': '#64748b',
      '--accent': '#60a5fa',
      '--accent-warm': '#fb923c',
      '--accent-2': '#a78bfa',
      '--app-link': '#60a5fa',
      '--app-link-soft': '#93c5fd',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    light: {
      '--app-bg': '#f0f4f8',
      '--app-bg-elevated': '#f8fafc',
      '--app-bg-muted': '#e4eaf0',
      '--app-bg-sunken': '#d3dce6',
      '--app-text': '#2d3748',
      '--app-text-heading': '#1a202c',
      '--app-text-subtle': '#4a5568',
      '--accent': '#4f6ef7',
      '--accent-warm': '#ed8936',
      '--accent-2': '#805ad5',
      '--app-link': '#3b5bdb',
      '--app-link-soft': '#2c3e9c',
    },
    dark: {
      '--app-bg': '#0d1117',
      '--app-bg-elevated': '#161b22',
      '--app-bg-muted': '#21262d',
      '--app-bg-sunken': '#040609',
      '--app-text': '#c9d1d9',
      '--app-text-heading': '#f0f6fc',
      '--app-text-subtle': '#8b949e',
      '--accent': '#79b8ff',
      '--accent-warm': '#f0883e',
      '--accent-2': '#b392f0',
      '--app-link': '#79b8ff',
      '--app-link-soft': '#a5d6ff',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    light: {
      '--app-bg': '#f0fdf4',
      '--app-bg-elevated': '#ffffff',
      '--app-bg-muted': '#dcfce7',
      '--app-bg-sunken': '#bbf7d0',
      '--app-text': '#1a3a2a',
      '--app-text-heading': '#052e16',
      '--app-text-subtle': '#166534',
      '--accent': '#059669',
      '--accent-warm': '#d97706',
      '--accent-2': '#7c3aed',
      '--app-link': '#047857',
      '--app-link-soft': '#065f46',
    },
    dark: {
      '--app-bg': '#0a1a10',
      '--app-bg-elevated': '#0f2417',
      '--app-bg-muted': '#14321f',
      '--app-bg-sunken': '#050d08',
      '--app-text': '#a7f3d0',
      '--app-text-heading': '#d1fae5',
      '--app-text-subtle': '#6ee7b7',
      '--accent': '#34d399',
      '--accent-warm': '#fbbf24',
      '--accent-2': '#a78bfa',
      '--app-link': '#34d399',
      '--app-link-soft': '#6ee7b7',
    },
  },
  {
    id: 'violet',
    label: 'Violet',
    light: {
      '--app-bg': '#faf5ff',
      '--app-bg-elevated': '#ffffff',
      '--app-bg-muted': '#f3e8ff',
      '--app-bg-sunken': '#e9d5ff',
      '--app-text': '#3b1f6b',
      '--app-text-heading': '#1e0a3c',
      '--app-text-subtle': '#6d28d9',
      '--accent': '#7c3aed',
      '--accent-warm': '#f59e0b',
      '--accent-2': '#ec4899',
      '--app-link': '#6d28d9',
      '--app-link-soft': '#4c1d95',
    },
    dark: {
      '--app-bg': '#0e0716',
      '--app-bg-elevated': '#160d24',
      '--app-bg-muted': '#1e1232',
      '--app-bg-sunken': '#060309',
      '--app-text': '#ddd6fe',
      '--app-text-heading': '#ede9fe',
      '--app-text-subtle': '#a78bfa',
      '--accent': '#a78bfa',
      '--accent-warm': '#fbbf24',
      '--accent-2': '#f472b6',
      '--app-link': '#c4b5fd',
      '--app-link-soft': '#ddd6fe',
    },
  },
];
