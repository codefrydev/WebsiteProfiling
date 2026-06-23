
import {
  Hash, Gauge, Activity, BarChart3, LineChart, PieChart, Table, Type, Grid3x3, type LucideIcon,
} from 'lucide-react';
import type { VizType, QuerySpec } from '@/lib/dashboard/engine/types';
import { ALL_VIZ, VIZ_META, vizFitsSpec } from '@/lib/dashboard/charts/vizMeta';

const ICONS: Record<VizType, LucideIcon> = {
  kpi: Hash, 'stat-card': Hash, gauge: Gauge, sparkline: Activity,
  bar: BarChart3, 'horizontal-bar': BarChart3, 'stacked-bar': BarChart3,
  line: LineChart, area: LineChart,
  pie: PieChart, doughnut: PieChart, treemap: Grid3x3, funnel: BarChart3,
  scatter: Activity, radar: Grid3x3, heatmap: Grid3x3,
  table: Table, text: Type,
};

interface VizGalleryProps {
  value: VizType;
  spec: QuerySpec;
  /** Datasets list their preferred viz first; others are still selectable. */
  preferred?: VizType[];
  onChange: (viz: VizType) => void;
}

export function VizGallery({ value, spec, preferred, onChange }: VizGalleryProps) {
  const order = preferred && preferred.length
    ? [...preferred, ...ALL_VIZ.filter((v) => !preferred.includes(v))]
    : ALL_VIZ;

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {order.map((viz) => {
        const Icon = ICONS[viz];
        const fits = vizFitsSpec(viz, spec);
        const active = value === viz;
        return (
          <button
            key={viz}
            onClick={() => onChange(viz)}
            title={fits ? VIZ_META[viz].label : `${VIZ_META[viz].label} — needs more fields`}
            className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] transition-colors ${
              active
                ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                : fits
                  ? 'border-default hover:border-blue-500/50 text-muted-foreground hover:text-bright'
                  : 'border-default/50 text-muted-foreground/40'
            }`}
          >
            <Icon className="h-4 w-4" />
            {VIZ_META[viz].label}
          </button>
        );
      })}
    </div>
  );
}
