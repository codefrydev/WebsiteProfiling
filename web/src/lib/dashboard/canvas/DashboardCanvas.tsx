import { useCallback, useMemo } from 'react';
import GridLayout, {
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './dashboardGrid.css';
import { WidgetFrame } from '@/lib/dashboard/widgets/WidgetFrame';
import type { Widget } from '@/lib/dashboard/engine/doc';
import type { QuerySpec } from '@/lib/dashboard/engine/types';

const COLS = 12;
const ROW_HEIGHT = 80;
const GRID_MARGIN: [number, number] = [12, 12];
const GRID_PADDING: [number, number] = [0, 0];
const RESIZE_HANDLES = ['se', 's', 'e'] as const;

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

  const persistLayout = useCallback(
    (next: Layout) => {
      onLayoutChange(next);
    },
    [onLayoutChange],
  );

  return (
    <GridLayout
      width={containerWidth}
      layout={layout}
      gridConfig={{
        cols: COLS,
        rowHeight: ROW_HEIGHT,
        margin: GRID_MARGIN,
        containerPadding: GRID_PADDING,
      }}
      dragConfig={{
        enabled: isEditing,
        handle: '.drag-handle',
        cancel: '.widget-no-drag',
        threshold: 0,
      }}
      resizeConfig={{
        enabled: isEditing,
        handles: [...RESIZE_HANDLES],
      }}
      compactor={verticalCompactor}
      className={isEditing ? 'layout dashboard-grid-editing' : 'layout'}
      onDragStop={persistLayout}
      onResizeStop={persistLayout}
    >
      {widgets.map((widget) => (
        <div key={widget.id} className="widget-grid-slot">
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
