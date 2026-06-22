'use client';

import type { Widget, VizOptions } from '@/lib/dashboard/engine/doc';
import { PALETTE_IDS } from '@/lib/dashboard/charts/theme';

const FORMATS = [
  { value: '', label: 'Default' },
  { value: '0', label: 'Integer' },
  { value: '0.0', label: '1 decimal' },
  { value: '0.00', label: '2 decimals' },
  { value: 'score', label: 'Score /100' },
  { value: '0.0%', label: 'Percent (fraction)' },
  { value: 'pct', label: 'Percent (0–100)' },
];

const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1';
const inputCls = 'w-full px-2 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500';

export function FormatPanel({ widget, onChange }: { widget: Widget; onChange: (w: Widget) => void }) {
  const o = widget.vizOptions ?? {};
  const setOpt = (patch: Partial<VizOptions>) => onChange({ ...widget, vizOptions: { ...o, ...patch } });
  const viz = widget.viz;
  const isChart = !['kpi', 'stat-card', 'gauge', 'table', 'text'].includes(viz);

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Title</label>
        <input
          type="text"
          value={widget.title}
          placeholder="(auto)"
          onChange={(e) => onChange({ ...widget, title: e.target.value })}
          className={inputCls}
        />
      </div>

      {viz === 'text' ? (
        <div>
          <label className={labelCls}>Markdown</label>
          <textarea
            value={o.text ?? ''}
            onChange={(e) => setOpt({ text: e.target.value })}
            rows={8}
            className={`${inputCls} font-mono resize-y`}
          />
        </div>
      ) : (
        <>
          {(viz === 'kpi' || viz === 'stat-card' || viz === 'gauge' || isChart) && (
            <div>
              <label className={labelCls}>Number format</label>
              <select value={o.format ?? ''} onChange={(e) => setOpt({ format: e.target.value || undefined })} className={inputCls}>
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          )}

          {viz === 'stat-card' && (
            <div>
              <label className={labelCls}>Subtitle</label>
              <input type="text" value={o.subtitle ?? ''} onChange={(e) => setOpt({ subtitle: e.target.value || undefined })} className={inputCls} />
            </div>
          )}

          {viz === 'gauge' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Min</label>
                <input type="number" value={o.axisMin ?? 0} onChange={(e) => setOpt({ axisMin: Number(e.target.value) })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Max</label>
                <input type="number" value={o.axisMax ?? 100} onChange={(e) => setOpt({ axisMax: Number(e.target.value) })} className={inputCls} />
              </div>
            </div>
          )}

          {viz === 'table' && (
            <div>
              <label className={labelCls}>Max rows</label>
              <input type="number" min={1} max={500} value={o.tableLimit ?? 50} onChange={(e) => setOpt({ tableLimit: Number(e.target.value) })} className={inputCls} />
            </div>
          )}

          {isChart && (
            <>
              <div>
                <label className={labelCls}>Color palette</label>
                <select value={o.palette ?? 'default'} onChange={(e) => setOpt({ palette: e.target.value })} className={inputCls}>
                  {PALETTE_IDS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={o.showLegend ?? false} onChange={(e) => setOpt({ showLegend: e.target.checked })} />
                Show legend
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={o.dataLabels ?? false} onChange={(e) => setOpt({ dataLabels: e.target.checked })} />
                Show data labels
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}
