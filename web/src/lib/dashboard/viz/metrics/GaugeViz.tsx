'use client';

import { scoreBandColor } from '@/utils/chartPalette';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function GaugeViz({ data }: VizRenderProps) {
  const score = typeof data.kpiValue === 'number' ? data.kpiValue : Number(data.kpiValue);
  const valid = Number.isFinite(score) ? score : null;
  const clamped = valid != null ? Math.min(100, Math.max(0, valid)) : 0;
  const color = scoreBandColor(valid);
  return (
    <div className="flex items-center justify-center py-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke="#1F2937" strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={valid != null ? `${clamped}, 100` : '0, 100'}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-bright">
          {valid != null ? Math.round(valid) : '—'}
        </div>
      </div>
    </div>
  );
}
