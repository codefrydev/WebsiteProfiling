import { useMemo } from 'react';
import type { ChartOptions, TooltipItem } from 'chart.js';
import type { ReportLink } from '@/types';
import { strings } from '@/lib/strings';
import { barOptionsHorizontal } from '@/utils/chartJsDefaults';
import type { LinksExploreCharts } from './types';

export function useLinksExploreCharts(links: ReportLink[]) {
  const vl = strings.views.links;
  const sj = strings.common;

  const charts = useMemo((): LinksExploreCharts | null => {
    if (links.length === 0) return null;
    const statusMap = new Map<string, number>();
    links.forEach((l) => {
      const s = String(l.status ?? sj.emDash);
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    });
    const statusPairs = [...statusMap.entries()].sort((a, b) => b[1] - a[1]);
    let thin = 0;
    let medium = 0;
    let long = 0;
    let noData = 0;
    links.forEach((l) => {
      const w = l.word_count;
      if (w == null || w === 0) {
        noData += 1;
        return;
      }
      if (w < 300) thin += 1;
      else if (w < 1000) medium += 1;
      else long += 1;
    });
    return {
      statusLabels: statusPairs.map((p) => p[0]),
      statusValues: statusPairs.map((p) => p[1]),
      wcLabels: vl.wcBands,
      wcValues: [thin, medium, long, noData],
    };
  }, [links, vl.wcBands, sj.emDash]);

  const barOptions = useMemo((): ChartOptions<'bar'> => {
    const base = barOptionsHorizontal();
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) => {
              const n = Number(ctx.raw);
              return ` ${n.toLocaleString()} ${n !== 1 ? vl.urlMany : vl.urlOne}`;
            },
          },
        },
      },
    } as ChartOptions<'bar'>;
  }, [vl.urlMany, vl.urlOne]);

  const chartCount = charts ? 2 : 0;

  return { charts, barOptions, chartCount };
}
