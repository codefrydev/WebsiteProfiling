import type { WidgetData } from '@/lib/dashboard/data/fetchWidgetData';
import type { Widget, WidgetOptions } from '@/lib/dashboard/types';
import type { CatalogEntry } from '@/lib/dashboard/catalog/catalog';

export interface VizRenderProps {
  widget: Widget;
  data: WidgetData;
  catalog: CatalogEntry | undefined;
  opts: WidgetOptions;
}
