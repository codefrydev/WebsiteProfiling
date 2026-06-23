
import { useRef } from 'react';
import { GripVertical, Settings, Copy, X, Download, Image as ImageIcon } from 'lucide-react';
import Card from '@/components/Card';
import { useWidgetQuery } from '@/lib/dashboard/hooks/useWidgetQuery';
import { WidgetBody } from '@/lib/dashboard/widgets/WidgetBody';
import { WidgetErrorBoundary } from '@/lib/dashboard/widgets/WidgetErrorBoundary';
import { getDataset } from '@/lib/dashboard/engine/datasets';
import { isEChartsViz } from '@/lib/dashboard/charts/optionBuilders';
import { downloadCsv } from '@/lib/dashboard/export/csv';
import { chartToPng } from '@/lib/dashboard/export/png';
import type { Widget } from '@/lib/dashboard/engine/doc';
import type { QuerySpec } from '@/lib/dashboard/engine/types';
import type { EChartsInstance } from '@/lib/dashboard/charts/echartsCore';

export interface WidgetFrameProps {
  widget: Widget;
  isEditing: boolean;
  selected?: boolean;
  /** Effective query with board interactions (slicers/cross-filter/drill) folded in. */
  specOverride?: QuerySpec;
  /** Active drill path + drill-up handler. */
  drill?: { path: { field: string; value: string }[]; onUp: () => void };
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  /** Cross-filter: a category was clicked. */
  onSelect?: (widgetId: string, category: string, seriesKey?: string) => void;
}

export function WidgetFrame({
  widget,
  isEditing,
  selected,
  specOverride,
  drill,
  onEdit,
  onRemove,
  onDuplicate,
  onSelect,
}: WidgetFrameProps) {
  const { result, status } = useWidgetQuery(widget.datasetId, specOverride ?? widget.query);
  const chartRef = useRef<EChartsInstance | null>(null);
  const datasetLabel = getDataset(widget.datasetId)?.label ?? widget.datasetId;
  const title = widget.title || datasetLabel;

  return (
    <Card
      padding="tight"
      className={`h-full flex flex-col min-h-0 overflow-hidden relative group/widget ${
        isEditing ? 'pointer-events-none' : ''
      } ${selected ? 'ring-2 ring-blue-500/70' : ''}`}
    >
      <div
        className={`widget-edit-chrome flex items-start justify-between gap-2 mb-1.5 shrink-0 ${
          isEditing ? 'drag-handle cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isEditing && (
            <span className="shrink-0 text-muted-foreground pointer-events-none" aria-hidden>
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate" title={title}>
            {title}
          </p>
        </div>
        <div className="widget-no-drag flex items-center gap-1 shrink-0 opacity-0 group-hover/widget:opacity-100 transition-opacity">
          {widget.viz !== 'text' && (
            <button
              onClick={() => downloadCsv(title, result.table)}
              title="Export CSV"
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          {isEChartsViz(widget.viz) && (
            <button
              onClick={() => chartRef.current && chartToPng(chartRef.current, title)}
              title="Export PNG"
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {isEditing && onEdit && (
            <button
              onClick={() => onEdit(widget.id)}
              title="Configure widget"
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
          {isEditing && onDuplicate && (
            <button
              onClick={() => onDuplicate(widget.id)}
              title="Duplicate widget"
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {isEditing && onRemove && (
            <button
              onClick={() => onRemove(widget.id)}
              title="Remove widget"
              className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {drill && drill.path.length > 0 && (
        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted-foreground shrink-0">
          <button onClick={drill.onUp} className="px-1 rounded border border-default hover:text-bright hover:border-blue-500/50" title="Drill up">↑</button>
          <span className="truncate">{drill.path.map((p) => p.value).join(' › ')}</span>
        </div>
      )}
      <div className={`flex-1 min-h-0 overflow-hidden ${isEditing ? 'widget-edit-body' : ''}`}>
        <WidgetErrorBoundary resetKey={`${widget.viz}:${widget.datasetId}`}>
          <WidgetBody
            widget={widget}
            result={result}
            status={status}
            onSelect={onSelect ? (cat, sk) => onSelect(widget.id, cat, sk) : undefined}
            onChartReady={(chart) => {
              chartRef.current = chart;
            }}
          />
        </WidgetErrorBoundary>
      </div>
    </Card>
  );
}
