'use client';

import { useMemo } from 'react';
import GridLayout from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { Layout, LayoutItem } from 'react-grid-layout';
import { WidgetFrame } from '@/lib/dashboard/widgets/WidgetFrame';
import type { Widget } from '@/lib/dashboard/engine/doc';
import type { QuerySpec } from '@/lib/dashboard/engine/types';

const COLS = 12;
const ROW_HEIGHT = 80;

interface DashboardCanvasProps {
  widgets: Widget[];
  isEditing: boolean;
  containerWidth: number;
  selectedWidgetId?: string | null;
  /** Effective query per widget with board interactions folded in. */
  specForWidget?: (widget: Widget) => QuerySpec;
  /** Active drill path per widget (for the breadcrumb). */
  drillForWidget?: (widget: Widget) => { path: { field: string; value: string }[] } | undefined;
  onLayoutChange: (layout: Layout) => void;
  onEditWidget?: (id: string) => void;
  onRemoveWidget?: (id: string) => void;
  onDuplicateWidget?: (id: string) => void;
  onSelectWidget?: (id: string) => void;
  onCrossFilter?: (widgetId: string, category: string, seriesKey?: string) => void;
  onDrillUp?: (id: string) => void;
}

export function DashboardCanvas({
  widgets,
  isEditing,
  containerWidth,
  selectedWidgetId,
  specForWidget,
  drillForWidget,
  onLayoutChange,
  onEditWidget,
  onRemoveWidget,
  onDuplicateWidget,
  onSelectWidget,
  onCrossFilter,
  onDrillUp,
}: DashboardCanvasProps) {
  const layout = useMemo<LayoutItem[]>(
    () =>
      widgets.map((w) => ({
        i: w.id,
        x: w.layout.x,
        y: w.layout.y,
        w: w.layout.w,
        h: w.layout.h,
        minW: 2,
        minH: 2,
      })),
    [widgets],
  );

  return (
    <GridLayout
      className="layout"
      layout={layout}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      width={containerWidth}
      isDraggable={isEditing}
      isResizable={isEditing}
      draggableHandle=".drag-handle"
      onDragStop={onLayoutChange}
      onResizeStop={onLayoutChange}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      resizeHandles={['se', 's', 'e']}
    >
      {widgets.map((widget) => (
        <div
          key={widget.id}
          style={{ overflow: 'hidden' }}
          onMouseDownCapture={isEditing && onSelectWidget ? () => onSelectWidget(widget.id) : undefined}
        >
          <WidgetFrame
            widget={widget}
            isEditing={isEditing}
            selected={selectedWidgetId === widget.id}
            specOverride={specForWidget?.(widget)}
            drill={(() => {
              const d = drillForWidget?.(widget);
              return d && d.path.length ? { path: d.path, onUp: () => onDrillUp?.(widget.id) } : undefined;
            })()}
            onEdit={onEditWidget}
            onRemove={onRemoveWidget}
            onDuplicate={onDuplicateWidget}
            onSelect={onCrossFilter}
          />
        </div>
      ))}
    </GridLayout>
  );
}
