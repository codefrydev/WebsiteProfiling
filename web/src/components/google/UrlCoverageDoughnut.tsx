
import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { palette } from '../../utils/chartPalette';
import { doughnutOptionsBottomLegend } from '../../utils/chartJsDefaults';
import { strings } from '../../lib/strings';
import GoogleChartCard from './GoogleChartCard';
import type { UrlJoinData } from '@/types/components';

ChartJS.register(ArcElement, Tooltip, Legend);

interface UrlCoverageDoughnutProps {
  urlJoin: UrlJoinData | null | undefined;
  devData?: unknown;
  title?: string;
  hint?: string;
  ariaLabel?: string;
}

export default function UrlCoverageDoughnut({
  urlJoin,
  devData,
  title,
  hint,
  ariaLabel,
}: UrlCoverageDoughnutProps) {
  const sp = strings.views.searchPerformance;
  const chartTitle = title ?? sp.charts.coverageTitle;
  const chartHint = hint ?? sp.charts.coverageHint;
  const chartAria = ariaLabel ?? sp.charts.coverageAria;

  const chart = useMemo(() => {
    if (!urlJoin) return null;
    const segments = [
      { key: 'matched', label: sp.urlJoin.matched },
      { key: 'crawl_only', label: sp.urlJoin.crawlOnly },
      { key: 'gsc_only', label: sp.urlJoin.gscOnly },
      { key: 'ga4_only', label: sp.urlJoin.ga4Only },
    ];
    const labels: string[] = [];
    const values: number[] = [];
    for (const seg of segments) {
      const v = Number(urlJoin[seg.key] || 0);
      if (v > 0) {
        labels.push(seg.label);
        values.push(v);
      }
    }
    if (!values.length) return null;
    return {
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: palette(labels.length) }],
      },
    };
  }, [urlJoin, sp]);

  const opts = useMemo(() => doughnutOptionsBottomLegend(), []);

  if (!chart) {
    return (
      <GoogleChartCard
        title={chartTitle}
        hint={chartHint}
        ariaLabel={chartAria}
        heightClass="h-48"
        devData={devData}
      >
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </GoogleChartCard>
    );
  }

  return (
    <GoogleChartCard
      title={chartTitle}
      hint={chartHint}
      ariaLabel={chartAria}
      heightClass="h-48"
      devData={devData}
    >
      <Doughnut data={chart.data} options={opts} />
    </GoogleChartCard>
  );
}
