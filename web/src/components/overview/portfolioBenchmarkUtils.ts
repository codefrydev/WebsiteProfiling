import { strings, format } from '@/lib/strings';

const vo = strings.views.overview;

export function portfolioDeltaNarrative(delta: number | null): string | undefined {
  if (delta == null) return undefined;
  if (delta === 0) return vo.portfolioEvenMedian;
  const abs = Math.abs(delta);
  if (delta > 0) {
    return format(vo.portfolioAheadOfMedian, { delta: abs });
  }
  return format(vo.portfolioBehindMedian, { delta: abs });
}

export function portfolioDeltaClassName(delta: number | null): string {
  if (delta == null) return 'text-muted-foreground';
  if (delta > 0) return 'text-green-700 dark:text-green-400';
  if (delta <= -10) return 'text-red-600 dark:text-red-400';
  if (delta < 0) return 'text-amber-700 dark:text-amber-400';
  return 'text-muted-foreground';
}

export function portfolioMedianClassName(median: number | null | undefined): string {
  if (median == null) return 'text-muted-foreground';
  if (median >= 80) return 'text-green-700 dark:text-green-400';
  if (median >= 50) return 'text-yellow-700 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}
