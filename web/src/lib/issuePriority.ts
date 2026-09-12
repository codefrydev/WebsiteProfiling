export const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low'] as const;

export type PriorityKey = (typeof PRIORITY_ORDER)[number];

export interface PriorityStyle {
  border: string;
  bg: string;
  text: string;
  ring: string;
  order: number;
  chartColor: string;
}

export const PRIORITY_CONFIG: Record<PriorityKey, PriorityStyle> = {
  Critical: {
    border: 'border-l-md-sys-error',
    bg: 'bg-md-sys-error-container/30',
    text: 'text-md-sys-error',
    ring: 'ring-2 ring-md-sys-error/30 border-md-sys-error',
    order: 0,
    chartColor: '#EF4444',
  },
  High: {
    border: 'border-l-md-sys-error/70',
    bg: 'bg-md-sys-error-container/20',
    text: 'text-md-sys-error',
    ring: 'ring-2 ring-md-sys-error/30 border-md-sys-error/70',
    order: 1,
    chartColor: '#F97316',
  },
  Medium: {
    border: 'border-l-md-sys-tertiary',
    bg: 'bg-md-sys-tertiary-container/30',
    text: 'text-md-sys-on-tertiary-container',
    ring: 'ring-2 ring-md-sys-tertiary/30 border-md-sys-tertiary',
    order: 2,
    chartColor: '#EAB308',
  },
  Low: {
    border: 'border-l-md-sys-outline',
    bg: 'bg-md-sys-surface-container-high',
    text: 'text-md-sys-on-surface-variant',
    ring: 'ring-2 ring-md-sys-outline/30 border-md-sys-outline',
    order: 3,
    chartColor: '#94A3B8',
  },
};

/**
 * Returns theme-adaptive colors for canvas charts (Line, Bar, Doughnut).
 * Canvas 2D context cannot resolve CSS var(--...) tokens, so concrete
 * hex/rgba strings are required.
 */
export function getPriorityChartColor(
  priority: PriorityKey,
  isDark = false,
): { stroke: string; fill: string } {
  if (isDark) {
    switch (priority) {
      case 'Critical':
        return { stroke: '#F87171', fill: 'rgba(248, 113, 113, 0.15)' };
      case 'High':
        return { stroke: '#FB923C', fill: 'rgba(251, 146, 60, 0.15)' };
      case 'Medium':
        return { stroke: '#FACC15', fill: 'rgba(250, 204, 21, 0.15)' };
      case 'Low':
        return { stroke: '#94A3B8', fill: 'rgba(148, 163, 184, 0.15)' };
    }
  }
  switch (priority) {
    case 'Critical':
      return { stroke: '#EF4444', fill: 'rgba(239, 68, 68, 0.12)' };
    case 'High':
      return { stroke: '#F97316', fill: 'rgba(249, 115, 22, 0.12)' };
    case 'Medium':
      return { stroke: '#EAB308', fill: 'rgba(234, 179, 8, 0.12)' };
    case 'Low':
      return { stroke: '#64748B', fill: 'rgba(100, 116, 139, 0.12)' };
  }
}

export function normalizePriority(raw: string | undefined | null): PriorityKey {
  const cap = raw ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : 'Medium';
  if (cap === 'Critical' || cap === 'High' || cap === 'Medium' || cap === 'Low') {
    return cap;
  }
  return 'Medium';
}

export function getPriorityConfig(priority: string | undefined | null): PriorityStyle {
  return PRIORITY_CONFIG[normalizePriority(priority)];
}
