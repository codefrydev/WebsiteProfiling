import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { syncChartJsDefaultsColor } from '@/utils/chartJsDefaults';

let registered = false;

export function ensureOverviewChartsRegistered() {
  if (registered) return;
  ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
  if (typeof ChartJS.defaults?.font !== 'undefined') {
    ChartJS.defaults.font.size = 11;
  }
  syncChartJsDefaultsColor();
  registered = true;
}
