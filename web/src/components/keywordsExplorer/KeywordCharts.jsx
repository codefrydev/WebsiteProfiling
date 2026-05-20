'use client';

import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { palette } from '../../utils/chartPalette';
import {
  registerChartJsBase,
  barOptionsHorizontal,
  doughnutOptionsBottomLegend,
} from '../../utils/chartJsDefaults';
import { strings } from '../../lib/strings';
import GoogleChartCard from '../google/GoogleChartCard';
import { buildIntentCounts, buildSourceCounts, SOURCE_CONFIG } from './keywordTableUtils';

registerChartJsBase();

const INTENT_ORDER = ['informational', 'commercial', 'transactional', 'navigational', 'other'];

export function IntentMixChart({ rows }) {
  const ke = strings.views.keywordsExplorer;
  const chart = useMemo(() => {
    const counts = buildIntentCounts(rows);
    const labels = INTENT_ORDER.filter((k) => counts[k] > 0).map(
      (k) => (k === 'other' ? 'Other' : k.charAt(0).toUpperCase() + k.slice(1)),
    );
    const values = INTENT_ORDER.filter((k) => counts[k] > 0).map((k) => counts[k]);
    if (!values.length) return null;
    return {
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: palette(labels.length) }],
      },
    };
  }, [rows]);

  const opts = useMemo(() => barOptionsHorizontal('Keywords'), [ke]);

  if (!chart) {
    return (
      <GoogleChartCard title={ke.charts.intentTitle} hint={ke.charts.intentHint} ariaLabel={ke.charts.intentAria}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground min-h-[12rem]">
          {strings.common.notEnoughData}
        </div>
      </GoogleChartCard>
    );
  }

  return (
    <GoogleChartCard title={ke.charts.intentTitle} hint={ke.charts.intentHint} ariaLabel={ke.charts.intentAria}>
      <Bar data={chart.data} options={opts} />
    </GoogleChartCard>
  );
}

export function SourceMixChart({ rows }) {
  const ke = strings.views.keywordsExplorer;
  const chart = useMemo(() => {
    const counts = buildSourceCounts(rows);
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    const labels = entries.map(([k]) => SOURCE_CONFIG[k]?.label || k);
    const values = entries.map(([, v]) => v);
    return {
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: palette(labels.length) }],
      },
    };
  }, [rows]);

  const opts = useMemo(() => doughnutOptionsBottomLegend(), []);

  if (!chart) {
    return (
      <GoogleChartCard title={ke.charts.sourceTitle} hint={ke.charts.sourceHint} ariaLabel={ke.charts.sourceAria} heightClass="h-56">
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </GoogleChartCard>
    );
  }

  return (
    <GoogleChartCard title={ke.charts.sourceTitle} hint={ke.charts.sourceHint} ariaLabel={ke.charts.sourceAria} heightClass="h-56">
      <Doughnut data={chart.data} options={opts} />
    </GoogleChartCard>
  );
}
