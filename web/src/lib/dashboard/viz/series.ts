import type { Widget, WidgetOptions } from '@/lib/dashboard/types';
import type { CatalogEntry } from '@/lib/dashboard/catalog/catalog';
import type { WidgetData } from '@/lib/dashboard/data/fetchWidgetData';

export interface ChartSeries {
  labels: string[];
  values: number[];
}

const SYNTH_X = '_label';
const SYNTH_Y = '_value';

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

/** Human label for a (possibly nested) field path: last segment, underscores → spaces. */
function fieldLabel(path: string): string {
  const last = path.split('.').pop() ?? path;
  return last.replace(/_/g, ' ');
}

/** Turn scalar tool results (e.g. lighthouse scores object) into chartable rows. */
function scalarBreakdownRows(data: WidgetData, catalog: CatalogEntry | undefined): Record<string, unknown>[] {
  const fields = catalog?.fields ?? Object.keys(data.raw);
  return fields
    .map((f) => ({ field: f, value: getPath(data.raw, f) }))
    .filter((e) => typeof e.value === 'number')
    .map((e) => ({ [SYNTH_X]: fieldLabel(e.field), [SYNTH_Y]: e.value as number }));
}

export function extractChartSeries(
  widget: Widget,
  data: WidgetData,
  catalog: CatalogEntry | undefined,
  opts: WidgetOptions,
): ChartSeries | null {
  let xField = widget.binding.xField ?? catalog?.defaultXField ?? '';
  let yField = widget.binding.yField ?? catalog?.defaultYField ?? '';

  let rows = data.rows.length ? [...data.rows] : scalarBreakdownRows(data, catalog);
  if (!rows.length) return null;

  if (!xField || !yField) {
    if (rows[0][SYNTH_X] != null) {
      xField = xField || SYNTH_X;
      yField = yField || SYNTH_Y;
    } else {
      return null;
    }
  }

  const sort = opts.chartSort ?? 'none';
  if (sort !== 'none') {
    rows.sort((a, b) => {
      const av = Number(a[yField] ?? 0);
      const bv = Number(b[yField] ?? 0);
      return sort === 'asc' ? av - bv : bv - av;
    });
  }

  const maxItems = opts.chartMaxItems ?? 20;
  rows = rows.slice(0, maxItems);

  return {
    labels: rows.map((r) => String(r[xField] ?? '')),
    values: rows.map((r) => Number(r[yField] ?? 0)),
  };
}
