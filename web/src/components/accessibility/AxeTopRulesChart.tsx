import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ChartCard from '@/components/ChartCard';
import { strings } from '@/lib/strings';
import { barOptionsHorizontal } from '@/utils/chartJsDefaults';
import { palette, sortByValue } from '@/utils/chartPalette';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface AxeTopRulesChartProps {
  rules: Array<{ rule_id?: string; count?: number }>;
  devData?: unknown;
  onRuleClick?: (ruleId: string) => void;
}

export default function AxeTopRulesChart({ rules, devData, onRuleClick }: AxeTopRulesChartProps) {
  const va = strings.views.accessibility;

  const chart = useMemo(() => {
    const top = rules.slice(0, 10);
    if (!top.length) return null;
    const labels = top.map((r) => String(r.rule_id ?? ''));
    const values = top.map((r) => Number(r.count ?? 0));
    const { labels: sortedLabels, values: sortedValues } = sortByValue(labels, values, 'asc');
    return {
      data: {
        labels: sortedLabels,
        datasets: [
          {
            data: sortedValues,
            backgroundColor: palette(sortedLabels.length),
            label: va.statRules,
          },
        ],
      },
      ruleIds: sortedLabels,
    };
  }, [rules, va.statRules]);

  const opts = useMemo((): ChartOptions<'bar'> => {
    const base = barOptionsHorizontal(va.statRules) as ChartOptions<'bar'>;
    if (!onRuleClick) return base;
    return {
      ...base,
      onClick: (_event, elements, chart) => {
        if (!elements.length || !chart) return;
        const idx = elements[0].index;
        const label = chart.data.labels?.[idx];
        if (typeof label === 'string' && label) onRuleClick(label);
      },
      onHover: (event, elements) => {
        const target = event.native?.target as HTMLElement | undefined;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
    };
  }, [onRuleClick, va.statRules]);

  if (!chart) {
    return (
      <ChartCard title={va.topRulesChartTitle} hint={va.topRulesChartHint} ariaLabel={va.topRulesChartAria} devData={devData}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {va.noViolations}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={va.topRulesChartTitle}
      hint={va.topRulesChartHint}
      ariaLabel={va.topRulesChartAria}
      heightClass="h-64"
      devData={devData}
    >
      <Bar data={chart.data} options={opts} />
    </ChartCard>
  );
}
