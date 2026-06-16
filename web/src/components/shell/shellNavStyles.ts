/** Shared nav/shell class strings — matches AppShell & PipelineShell. */

export const shellSidebarAsideClass =
  'flex shrink-0 flex-col border-r border-muted bg-brand-800';

export const shellSidebarRailClass =
  'flex w-14 shrink-0 flex-col items-center gap-2 border-r border-muted bg-brand-800 py-3';

export const shellContextHeaderClass =
  'flex shrink-0 items-center gap-2 border-b border-muted bg-brand-800/80 px-4 py-2 backdrop-blur-md';

export function shellNavItemClass(active: boolean, size: 'sm' | 'md' = 'sm'): string {
  const sizing =
    size === 'sm'
      ? 'gap-2 px-2.5 py-2 text-xs'
      : 'gap-3 px-3 py-2 text-sm';
  const base = `nav-btn press relative w-full flex items-center rounded-lg font-medium transition-all ${sizing}`;
  return active
    ? `${base} tab-active bg-blue-500/10 border border-blue-500/25 text-link`
    : `${base} text-muted-foreground hover:text-foreground hover:bg-brand-700/80`;
}

export function shellRailButtonClass(active = false): string {
  return `flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
    active
      ? 'tab-active bg-blue-500/10 text-link'
      : 'text-muted-foreground hover:bg-brand-700/80 hover:text-foreground'
  }`;
}

export function shellDraftItemClass(active: boolean): string {
  const base =
    'relative flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left text-xs transition-all';
  return active
    ? `${base} tab-active bg-blue-500/10 border border-blue-500/25 text-link`
    : `${base} text-muted-foreground hover:bg-brand-700/80 hover:text-foreground`;
}
