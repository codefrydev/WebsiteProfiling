'use client';

import { useMemo } from 'react';
import GridLayout from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { Layout, LayoutItem } from 'react-grid-layout';
import type { Widget } from '@/lib/dashboard/types';
import DashboardWidget from '@/lib/dashboard/builder/DashboardWidget';

interface DashboardGridProps {
  widgets: Widget[];
  propertyId: number;
  reportId: number | null;
  isEditing: boolean;
  containerWidth: number;
  onLayoutChange: (layout: Layout) => void;
  onRemoveWidget: (id: string) => void;
  onEditWidget: (id: string) => void;
}

const COLS = 12;
const ROW_HEIGHT = 80;

export default function DashboardGrid({
  widgets,
  propertyId,
  reportId,
  isEditing,
  containerWidth,
  onLayoutChange,
  onRemoveWidget,
  onEditWidget,
}: DashboardGridProps) {
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

  if (!widgets.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-default rounded-xl text-muted-foreground text-sm gap-2">
        <p className="font-medium">This dashboard is empty.</p>
        {isEditing ? (
          <p className="text-xs">Click <strong>Add widget</strong> to get started.</p>
        ) : (
          <p className="text-xs">Switch to <strong>Edit mode</strong> to add widgets.</p>
        )}
      </div>
    );
  }

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
        <div key={widget.id} style={{ overflow: 'hidden' }}>
          <DashboardWidget
            widget={widget}
            propertyId={propertyId}
            reportId={reportId}
            isEditing={isEditing}
            onRemove={onRemoveWidget}
            onEdit={onEditWidget}
          />
        </div>
      ))}
    </GridLayout>
  );
}
