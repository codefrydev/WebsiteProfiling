
import { CompactAreaSparkline } from '@/components/charts/compact/CompactAreaSparkline';
import { extractChartSeries } from '@/lib/dashboard/viz/series';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function SparklineViz(props: VizRenderProps) {
  const series = extractChartSeries(props.widget, props.data, props.catalog, props.opts);
  if (!series?.values.length) {
    const n = Number(props.data.kpiValue);
    if (Number.isFinite(n)) {
      return (
        <div className="flex items-center justify-center h-full py-2">
          <CompactAreaSparkline points={[n * 0.9, n * 0.95, n]} heightClass="h-10" />
        </div>
      );
    }
    return <EmptyData />;
  }
  return (
    <div className="flex items-center justify-center h-full py-2">
      <CompactAreaSparkline points={series.values} heightClass="h-10" />
    </div>
  );
}
