'use client';

import { useEffect, useState } from 'react';
import type { Widget } from '@/lib/dashboard/types';
import { fetchWidgetData, type WidgetData } from '@/lib/dashboard/data/fetchWidgetData';
import { catalogEntry } from '@/lib/dashboard/catalog/catalog';
import { renderViz, isDataViz } from '@/lib/dashboard/viz/registry';
import { VizErrorBoundary } from '@/lib/dashboard/viz/VizErrorBoundary';
import Card from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { AlertTriangle, RefreshCw, X, GripVertical, Settings } from 'lucide-react';

interface DashboardWidgetProps {
  widget: Widget;
  propertyId: number;
  reportId: number | null;
  isEditing?: boolean;
  onRemove?: (id: string) => void;
  onEdit?: (id: string) => void;
}

export default function DashboardWidget({
  widget,
  propertyId,
  reportId,
  isEditing = false,
  onRemove,
  onEdit,
}: DashboardWidgetProps) {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!propertyId || !isDataViz(widget.viz)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWidgetData(widget.binding, propertyId, reportId)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.binding, widget.viz, propertyId, reportId, retryCount]);

  const catalog = catalogEntry(widget.binding.toolName);
  const displayTitle = widget.title || catalog?.label || widget.binding.toolName;
  const opts = widget.options ?? {};

  const renderContent = () => {
    if (widget.viz === 'markdown') {
      return renderViz('markdown', { widget, data: data ?? { raw: {}, rows: [], kpiValue: null }, catalog, opts });
    }

    if (loading) {
      return (
        <div className="flex flex-col gap-2 pt-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col gap-2 items-start py-2">
          <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
          <button
            onClick={() => setRetryCount((c) => c + 1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-bright transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      );
    }

    if (!data) return renderViz(widget.viz, { widget, data: { raw: {}, rows: [], kpiValue: null }, catalog, opts });
    return renderViz(widget.viz, { widget, data, catalog, opts });
  };

  return (
    <Card padding="tight" className="h-full flex flex-col min-h-0 overflow-hidden relative group/widget">
      <div className="flex items-start justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {isEditing && (
            <span className="drag-handle cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground">
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
            {displayTitle}
          </p>
        </div>
        {isEditing && (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/widget:opacity-100 transition-opacity">
            {onEdit && (
              <button
                onClick={() => onEdit(widget.id)}
                title="Configure widget"
                className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(widget.id)}
                title="Remove widget"
                className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <VizErrorBoundary resetKey={`${widget.viz}:${retryCount}`}>{renderContent()}</VizErrorBoundary>
      </div>
    </Card>
  );
}
