import type { Widget, WidgetOptions } from '@/lib/dashboard/types';
import type { CatalogEntry } from '@/lib/dashboard/catalog/catalog';
import { measures } from '@/lib/dashboard/catalog/catalog';
import type { WidgetData } from '@/lib/dashboard/data/fetchWidgetData';

// ─── legacy ChartSeries (single-series) ────────────────────────────────────
export interface ChartSeries {
  labels: string[];
  values: number[];
}

// ─── SeriesSet (multi-series, normalized) ──────────────────────────────────
export interface SeriesSet {
  /** Category axis (xField values, one per tick). */
  labels: string[];
  /** 1..N datasets. Single-series has exactly one element. */
  series: { key: string; label: string; values: number[] }[];
  /** Whether the chart should render as stacked. */
  stacked?: boolean;
}

// ─── internal helpers ───────────────────────────────────────────────────────

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

/**
 * Turn scalar tool results (e.g. lighthouse scores object) into chartable rows.
 * Uses typed measure fields from catalog when available.
 */
function scalarBreakdownRows(data: WidgetData, catalog: CatalogEntry | undefined): Record<string, unknown>[] {
  const measureFields = catalog ? measures(catalog).map((f) => f.key) : Object.keys(data.raw);
  return measureFields
    .map((f) => ({ field: f, value: getPath(data.raw, f) }))
    .filter((e) => typeof e.value === 'number')
    .map((e) => ({ [SYNTH_X]: fieldLabel(e.field), [SYNTH_Y]: e.value as number }));
}

function sortAndSlice(
  rows: Record<string, unknown>[],
  yField: string,
  opts: WidgetOptions,
): Record<string, unknown>[] {
  const sort = opts.chartSort ?? 'none';
  if (sort !== 'none') {
    rows = [...rows].sort((a, b) => {
      const av = Number(a[yField] ?? 0);
      const bv = Number(b[yField] ?? 0);
      return sort === 'asc' ? av - bv : bv - av;
    });
  }
  return rows.slice(0, opts.chartMaxItems ?? 20);
}

// ─── extractMultiSeries ─────────────────────────────────────────────────────

/**
 * Extract a normalized SeriesSet from widget data.
 *
 * - When `binding.seriesField` is set: pivot rows by distinct series values
 *   (one dataset per value) with `xField` as category axis and `yField` as numeric value.
 * - When `seriesField` is unset: returns a single-series SeriesSet — drop-in
 *   replacement for `extractChartSeries`.
 */
export function extractMultiSeries(
  widget: Widget,
  data: WidgetData,
  catalog: CatalogEntry | undefined,
  opts: WidgetOptions,
): SeriesSet | null {
  const binding = widget.binding;
  let xField = binding.xField ?? defaultDimensionKey(catalog) ?? '';
  let yField = binding.yField ?? defaultMeasureKey(catalog) ?? '';
  const seriesField = binding.seriesField;

  let rows = data.rows.length ? [...data.rows] : scalarBreakdownRows(data, catalog);
  if (!rows.length) return null;

  // Resolve synthetic fields when we only have scalar breakdown rows
  if (!xField || !yField) {
    if (rows[0][SYNTH_X] != null) {
      xField = xField || SYNTH_X;
      yField = yField || SYNTH_Y;
    } else {
      return null;
    }
  }

  // ── Multi-series (group-by) ──────────────────────────────────────────────
  if (seriesField) {
    // Collect all distinct x-axis labels and series values
    const allLabels = [...new Set(rows.map((r) => String(r[xField] ?? '')))];
    const allSeriesKeys = [...new Set(rows.map((r) => String(r[seriesField] ?? '')))];

    // Index data: labelValue -> seriesValue -> numeric y
    const grid: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const lk = String(row[xField] ?? '');
      const sk = String(row[seriesField] ?? '');
      if (!grid[lk]) grid[lk] = {};
      grid[lk][sk] = Number(row[yField] ?? 0);
    }

    const maxItems = opts.chartMaxItems ?? 20;
    const labels = allLabels.slice(0, maxItems);
    const series = allSeriesKeys.map((sk) => ({
      key: sk,
      label: sk,
      values: labels.map((lk) => grid[lk]?.[sk] ?? 0),
    }));

    return { labels, series };
  }

  // ── Single-series ────────────────────────────────────────────────────────
  rows = sortAndSlice(rows, yField, opts);
  return {
    labels: rows.map((r) => String(r[xField] ?? '')),
    series: [
      {
        key: yField,
        label: fieldLabel(yField),
        values: rows.map((r) => Number(r[yField] ?? 0)),
      },
    ],
  };
}

/** First dimension key in catalog, used as default xField. */
function defaultDimensionKey(catalog: CatalogEntry | undefined): string | undefined {
  if (!catalog) return undefined;
  return catalog.fields.find((f) => f.role === 'dimension')?.key;
}

/** First measure key in catalog, used as default yField. */
function defaultMeasureKey(catalog: CatalogEntry | undefined): string | undefined {
  if (!catalog) return undefined;
  return catalog.fields.find((f) => f.role === 'measure')?.key;
}

// ─── legacy wrapper (kept for non-chart uses) ────────────────────────────────

/** @deprecated Use extractMultiSeries. */
export function extractChartSeries(
  widget: Widget,
  data: WidgetData,
  catalog: CatalogEntry | undefined,
  opts: WidgetOptions,
): ChartSeries | null {
  const ss = extractMultiSeries(widget, data, catalog, opts);
  if (!ss) return null;
  const s0 = ss.series[0];
  if (!s0) return null;
  return { labels: ss.labels, values: s0.values };
}
