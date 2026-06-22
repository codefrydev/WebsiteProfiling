/**
 * The ONLY module allowed to import from `echarts/*`.
 *
 * It registers exactly the chart types + components the dashboard uses, so the
 * bundle is tree-shaken. ChartRenderer imports this lazily (dynamic import), so
 * ECharts ships only in the /dashboards route chunk, never on the server.
 *
 * Guard: do not import `echarts/*` anywhere else — see scripts/check (grep) in
 * the verification step. Import from here instead.
 */
import * as echarts from 'echarts/core';
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  TreemapChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  TreemapChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  LabelLayout,
  CanvasRenderer,
]);

export type EChartsInstance = ReturnType<typeof echarts.init>;
export default echarts;
