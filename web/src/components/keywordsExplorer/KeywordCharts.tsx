
import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { palette } from '../../utils/chartPalette';
import { registerChartJsBase } from '../../utils/chartJsDefaults';
import { filterZeroSlices, doughnutOptionsWithPercentTooltip, formatCompositionAria } from '../../lib/chartDoughnutUtils';
import { strings } from '../../lib/strings';
import GoogleChartCard from '../google/GoogleChartCard';
import { ChartAccessibleFallback } from '../charts/ChartAccessibleFallback';
import { buildIntentCounts, buildSourceCounts, SOURCE_CONFIG } from './keywordTableUtils';
import type { KeywordIntent, KeywordRow } from '@/types/components';

registerChartJsBase();

const INTENT_ORDER: KeywordIntent[] = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
  'other',
];

function intentLabel(intent: KeywordIntent): string {
  return intent === 'other' ? 'Other' : intent.charAt(0).toUpperCase() + intent.slice(1);
}

interface IntentMixChartProps {
  rows: KeywordRow[];
  devData?: unknown;
}

export function IntentMixChart({ rows, devData }: IntentMixChartProps) {
  const ke = strings.views.keywordsExplorer;
  const chart = useMemo(() => {
    const counts = buildIntentCounts(rows);
    const labels = INTENT_ORDER.map((k) => intentLabel(k));
    const values = INTENT_ORDER.map((k) => counts[k] ?? 0);
    const filtered = filterZeroSlices(labels, values);
    if (filtered.values.length === 0) return null;
    return {
      data: {
        labels: filtered.labels,
        datasets: [{ data: filtered.values, backgroundColor: palette(filtered.labels.length) }],
      },
      aria: formatCompositionAria(filtered.labels, filtered.values, 'keywords'),
      rows: filtered.labels.map((label, i) => [label, filtered.values[i] ?? 0] as [string, string | number]),
    };
  }, [rows]);

  if (!chart) {
    return (
      <GoogleChartCard title={ke.charts.intentTitle} hint={ke.charts.intentHint} ariaLabel={ke.charts.intentAria} devData={devData}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground min-h-[12rem]">
          {strings.common.notEnoughData}
        </div>
      </GoogleChartCard>
    );
  }

  return (
    <GoogleChartCard title={ke.charts.intentTitle} hint={ke.charts.intentHint} ariaLabel={chart.aria} devData={devData}>
      <ChartAccessibleFallback summary={chart.aria} rows={chart.rows}>
        <div className="h-full min-h-[12rem] flex items-center justify-center" role="presentation">
          <div className="w-full max-w-[260px] h-52">
            <Doughnut data={chart.data} options={doughnutOptionsWithPercentTooltip()} />
          </div>
        </div>
      </ChartAccessibleFallback>
    </GoogleChartCard>
  );
}

interface SourceMixChartProps {
  rows: KeywordRow[];
  devData?: unknown;
}

export function SourceMixChart({ rows, devData }: SourceMixChartProps) {
  const ke = strings.views.keywordsExplorer;
  const chart = useMemo(() => {
    const counts = buildSourceCounts(rows);
    const entries = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (!entries.length) return null;
    const labels = entries.map(([k]) => SOURCE_CONFIG[k]?.label || k);
    const values = entries.map(([, v]) => v);
    const filtered = filterZeroSlices(labels, values);
    if (filtered.values.length === 0) return null;
    return {
      data: {
        labels: filtered.labels,
        datasets: [{ data: filtered.values, backgroundColor: palette(filtered.labels.length) }],
      },
      aria: formatCompositionAria(filtered.labels, filtered.values, 'keywords'),
      rows: filtered.labels.map((label, i) => [label, filtered.values[i] ?? 0] as [string, string | number]),
    };
  }, [rows]);

  if (!chart) {
    return (
      <GoogleChartCard title={ke.charts.sourceTitle} hint={ke.charts.sourceHint} ariaLabel={ke.charts.sourceAria} devData={devData}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </GoogleChartCard>
    );
  }

  return (
    <GoogleChartCard title={ke.charts.sourceTitle} hint={ke.charts.sourceHint} ariaLabel={chart.aria} devData={devData}>
      <ChartAccessibleFallback summary={chart.aria} rows={chart.rows}>
        <div className="h-full min-h-[12rem] flex items-center justify-center" role="presentation">
          <div className="w-full max-w-[260px] h-52">
            <Doughnut data={chart.data} options={doughnutOptionsWithPercentTooltip()} />
          </div>
        </div>
      </ChartAccessibleFallback>
    </GoogleChartCard>
  );
}
