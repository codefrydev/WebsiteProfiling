/** Shared nav/shell class strings — matches AppShell & chat-style sidebars. */

export const shellSidebarAsideClass =
  'flex shrink-0 flex-col border-r border-md-sys-outline-variant/40 bg-md-sys-surface-container';

export const shellSidebarRailClass =
  'flex w-14 shrink-0 flex-col items-center gap-2 border-r border-md-sys-outline-variant/40 bg-md-sys-surface-container py-3';

export const shellContextHeaderClass =
  'flex shrink-0 items-center gap-2 border-b border-md-sys-outline-variant/40 bg-md-sys-surface-container/80 px-4 py-2 backdrop-blur-md';

export function shellNavItemClass(active: boolean, size: 'sm' | 'md' = 'sm'): string {
  const sizing =
    size === 'sm'
      ? 'gap-2 px-3 py-2 text-xs'
      : 'gap-3 px-4 py-2.5 text-sm';
  const base = `nav-btn press relative w-full flex items-center rounded-full font-medium transition-all duration-200 ease-out active:scale-[0.98] ${sizing}`;
  return active
    ? `${base} tab-active bg-md-sys-secondary-container text-md-sys-on-secondary-container font-semibold shadow-xs`
    : `${base} text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-high/80`;
}

export function shellRailButtonClass(active = false): string {
  return `press flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
    active
      ? 'tab-active bg-md-sys-secondary-container text-md-sys-on-secondary-container shadow-xs'
      : 'text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high/80 hover:text-md-sys-on-surface'
  }`;
}

export function shellDraftItemClass(active: boolean): string {
  const base =
    'press relative flex min-w-0 flex-1 items-start gap-2 rounded-full px-3 py-2 text-left text-xs transition-all duration-200 ease-out active:scale-[0.98]';
  return active
    ? `${base} tab-active bg-md-sys-secondary-container text-md-sys-on-secondary-container font-semibold shadow-xs`
    : `${base} text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high/80 hover:text-md-sys-on-surface`;
}
