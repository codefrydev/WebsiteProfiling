
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
            className={`press flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] active:scale-95 transition-all ${
              active
                ? 'border-md-sys-primary bg-md-sys-primary-container/20 text-md-sys-primary font-medium'
                : fits
                  ? 'border-md-sys-outline-variant/40 hover:border-md-sys-primary/50 text-md-sys-on-surface-variant hover:text-md-sys-on-surface'
                  : 'border-md-sys-outline-variant/30 text-md-sys-on-surface-variant/40'
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
