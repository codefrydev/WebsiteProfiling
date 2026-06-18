import type { LinksFilterValues } from '@/components/links/LinksFilterBar';
import { sanitizeConditions, type AdvancedCondition } from './advancedLinkFilter';

/**
 * Persisted shape for a saved Links-explorer view. Stored as `filter_json` in the
 * existing `saved_crawl_filters` table (no schema change). Older rows hold a flat
 * {@link LinksFilterValues} object; {@link normalizeSavedView} upgrades those.
 *
 * `columns` is reserved for per-tab column customization (roadmap 1.2): an ordered
 * list of visible data-column keys; `undefined` means "use the defaults".
 */
export interface SavedLinksView {
  quick: LinksFilterValues;
  advanced: AdvancedCondition[];
  columns?: string[];
}

export function normalizeSavedView(raw: unknown, defaultQuick: LinksFilterValues): SavedLinksView {
  if (!raw || typeof raw !== 'object') {
    return { quick: { ...defaultQuick }, advanced: [] };
  }
  const obj = raw as Record<string, unknown>;
  const isNewShape = 'quick' in obj || 'advanced' in obj || 'columns' in obj;
  if (isNewShape) {
    const quick =
      obj.quick && typeof obj.quick === 'object' ? (obj.quick as Partial<LinksFilterValues>) : {};
    return {
      quick: { ...defaultQuick, ...quick },
      advanced: sanitizeConditions(obj.advanced),
      columns: Array.isArray(obj.columns)
        ? obj.columns.filter((c): c is string => typeof c === 'string')
        : undefined,
    };
  }
  // Legacy: the whole object was a flat LinksFilterValues.
  return { quick: { ...defaultQuick, ...(obj as Partial<LinksFilterValues>) }, advanced: [] };
}
