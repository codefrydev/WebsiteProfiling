/** PNG export of an ECharts widget via its native getDataURL. */
import type { EChartsInstance } from '@/lib/dashboard/charts/echartsCore';
import { sanitize } from '@/lib/dashboard/export/csv';

export function chartToPng(chart: EChartsInstance, name: string): void {
  if (typeof document === 'undefined') return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--app-bg').trim() || '#0b0f19';
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg });
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitize(name)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
