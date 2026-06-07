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
    border: 'border-l-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-700 dark:text-red-400',
    ring: 'ring-1 ring-red-500/20 border-red-900/30',
    order: 0,
    chartColor: '#EF4444',
  },
  High: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/10',
    text: 'text-orange-700 dark:text-orange-400',
    ring: 'ring-1 ring-orange-500/20 border-orange-900/30',
    order: 1,
    chartColor: '#F97316',
  },
  Medium: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-800 dark:text-yellow-400',
    ring: '',
    order: 2,
    chartColor: '#EAB308',
  },
  Low: {
    border: 'border-l-neutral-500',
    bg: 'bg-brand-700/10',
    text: 'text-muted-foreground',
    ring: '',
    order: 3,
    chartColor: '#64748B',
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
