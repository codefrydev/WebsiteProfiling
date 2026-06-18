export interface ColumnDef {
  key: string;
  label: string;
  alwaysVisible?: true;
}

export const LINK_TABLE_COLUMNS: readonly ColumnDef[] = [
  { key: 'url',              label: 'Page',           alwaysVisible: true },
  { key: 'status',           label: 'Status Code' },
  { key: 'inlinks',          label: 'Links In' },
  { key: 'depth',            label: 'Crawl Depth' },
  { key: 'response_time_ms', label: 'Load Time' },
  { key: 'word_count',       label: 'Words' },
  { key: 'custom_extract',   label: 'Custom Extract' },
  { key: 'js_errors',        label: 'JS Errors' },
];

const TOGGLEABLE = LINK_TABLE_COLUMNS.filter((c) => !c.alwaysVisible);

export const DEFAULT_COLUMN_KEYS: readonly string[] = TOGGLEABLE.map((c) => c.key);

export function resolveColumns(saved?: string[]): ReadonlySet<string> {
  if (saved == null) return new Set(DEFAULT_COLUMN_KEYS);
  return new Set(saved);
}

export function toggleColumn(current: string[] | undefined, key: string): string[] {
  const set = new Set(current ?? DEFAULT_COLUMN_KEYS);
  if (set.has(key)) {
    set.delete(key);
  } else {
    set.add(key);
  }
  return TOGGLEABLE.map((c) => c.key).filter((k) => set.has(k));
}

export function sanitizeColumns(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = new Set(TOGGLEABLE.map((c) => c.key));
  const filtered = raw.filter((k): k is string => typeof k === 'string' && valid.has(k));
  return filtered.length ? filtered : undefined;
}
