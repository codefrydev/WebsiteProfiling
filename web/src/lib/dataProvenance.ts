import { strings } from '@/lib/strings';

export type DataSourceId =
  | 'crawl'
  | 'lighthouse'
  | 'search_console'
  | 'analytics'
  | 'estimated'
  | 'ai';

export interface DataSourceMeta {
  id: DataSourceId;
  label: string;
  shortLabel: string;
  className: string;
}

const PROVENANCE = strings.dataProvenance as Record<
  DataSourceId,
  { label: string; shortLabel: string; className: string }
>;

export function dataSourceMeta(id: DataSourceId): DataSourceMeta {
  const row = PROVENANCE[id];
  return {
    id,
    label: row?.label ?? id,
    shortLabel: row?.shortLabel ?? id,
    className: row?.className ?? 'bg-brand-900/50 text-muted-foreground',
  };
}

export const DATA_SOURCE_IDS: DataSourceId[] = [
  'crawl',
  'lighthouse',
  'search_console',
  'analytics',
  'estimated',
  'ai',
];
