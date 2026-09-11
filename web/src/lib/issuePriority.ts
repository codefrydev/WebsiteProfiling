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
    chartColor: 'var(--md-sys-color-error, #d93025)',
  },
  High: {
    border: 'border-l-md-sys-error/70',
    bg: 'bg-md-sys-error-container/20',
    text: 'text-md-sys-error',
    ring: 'ring-2 ring-md-sys-error/30 border-md-sys-error/70',
    order: 1,
    chartColor: 'var(--md-sys-color-error, #ea8600)',
  },
  Medium: {
    border: 'border-l-md-sys-tertiary',
    bg: 'bg-md-sys-tertiary-container/30',
    text: 'text-md-sys-on-tertiary-container',
    ring: 'ring-2 ring-md-sys-tertiary/30 border-md-sys-tertiary',
    order: 2,
    chartColor: 'var(--md-sys-color-tertiary, #ea8600)',
  },
  Low: {
    border: 'border-l-md-sys-outline',
    bg: 'bg-md-sys-surface-container-high',
    text: 'text-md-sys-on-surface-variant',
    ring: 'ring-2 ring-md-sys-outline/30 border-md-sys-outline',
    order: 3,
    chartColor: 'var(--md-sys-color-outline, #94a3b8)',
  },
};

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
