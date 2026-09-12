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
  if (delta == null) return 'text-md-sys-on-surface-variant';
  if (delta > 0) return 'text-md-sys-success font-medium';
  if (delta <= -10) return 'text-md-sys-error font-medium';
  if (delta < 0) return 'text-md-sys-warning font-medium';
  return 'text-md-sys-on-surface-variant';
}

export function portfolioMedianClassName(median: number | null | undefined): string {
  if (median == null) return 'text-md-sys-on-surface-variant';
  if (median >= 80) return 'text-md-sys-success font-semibold';
  if (median >= 50) return 'text-md-sys-warning font-semibold';
  return 'text-md-sys-error font-semibold';
}
