'use client';

import type { ChartOptions } from 'chart.js';
import { BarChart3 } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { strings } from '@/lib/strings';
import { Card } from '@/components';
import { palette } from '@/utils/chartPalette';
import { registerChartJsBase } from '@/utils/chartJsDefaults';
import type { LinksExploreCharts } from './types';
import { LinksExplorerTabPanel } from './LinksExplorerTabPanel';

registerChartJsBase();

export interface LinksExplorerChartsTabProps {
  charts: LinksExploreCharts | null;
  barOptions: ChartOptions<'bar'>;
}

export function LinksExplorerChartsTab({ charts, barOptions }: LinksExplorerChartsTabProps) {
  const vl = strings.views.links;

  return (
    <LinksExplorerTabPanel tabId="charts" className="space-y-4">
      {charts ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="tight" shadow>
            <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartStatusTitle}</h2>
            <p className="text-xs text-muted-foreground mb-2">{vl.chartStatusHint}</p>
            <div className="h-48">
              <Bar
                data={{
                  labels: charts.statusLabels,
                  datasets: [{ data: charts.statusValues, backgroundColor: palette(charts.statusLabels.length) }],
                }}
                options={barOptions}
              />
            </div>
          </Card>
          <Card padding="tight" shadow>
            <h2 className="text-sm font-bold text-foreground mb-1">{vl.chartWcTitle}</h2>
            <p className="text-xs text-muted-foreground mb-2">{vl.chartWcHint}</p>
            <div className="h-48">
              <Bar
                data={{
                  labels: charts.wcLabels,
                  datasets: [{ data: charts.wcValues, backgroundColor: palette(charts.wcLabels.length) }],
                }}
                options={barOptions}
              />
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
          <BarChart3 className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          {vl.chartsEmpty}
        </Card>
      )}
    </LinksExplorerTabPanel>
  );
}
