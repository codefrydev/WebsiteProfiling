import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { format, strings } from '@/lib/strings';
import { buildLinksInspectHref } from '@/lib/reportNav';
import GoogleTableToolbar from '@/components/google/GoogleTableToolbar';
import SortablePaginatedTable from '@/components/google/SortablePaginatedTable';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';
import { exportCsv } from '@/components/google/tableUtils';
import { filterUrlRows, urlsToRows } from './sitemapGapUtils';
import type { TableColumn } from '@/types/components';

interface SitemapGapUrlPanelProps {
  urls: string[];
  total: number;
  title: string;
  globalSearch?: string;
  searchParams?: URLSearchParams | string | null;
  devData?: unknown;
}

export default function SitemapGapUrlPanel({
  urls,
  total,
  title,
  globalSearch = '',
  searchParams,
  devData,
}: SitemapGapUrlPanelProps) {
  const vi = strings.views.indexation;
  const cg = strings.components.urlGapLists;
  const sp = strings.views.searchPerformance.table;
  const [localSearch, setLocalSearch] = useState('');

  const rows = useMemo(() => urlsToRows(urls), [urls]);
  const filteredRows = useMemo(
    () => filterUrlRows(rows, globalSearch, localSearch),
    [globalSearch, localSearch, rows],
  );

  const isTruncated = total > urls.length;

  const columns = useMemo((): TableColumn[] => {
    return [
      {
        key: 'url',
        label: cg.columnUrl || 'URL',
        render: (v) => (
          <span className="font-mono text-xs break-all">{String(v ?? '')}</span>
        ),
      },
      {
        key: '_inspect',
        label: '',
        render: (_, row) => {
          if (!row) return null;
          const href = buildLinksInspectHref(String(row.url ?? ''), searchParams ?? null);
          return (
            <a
              href={href}
              title={cg.openInLinks || 'Open in Link Explorer'}
              className="inline-flex items-center gap-1 text-xs text-link hover:underline whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3" />
              {cg.openInLinks || 'Link Explorer'}
            </a>
          );
        },
      },
    ];
  }, [cg]);

  const exportColumns = columns.filter((c) => c.key !== '_inspect');

  if (!urls.length && total === 0) {
    return null;
  }

  return (
    <div className={devData != null ? 'relative group/dev-card mb-6' : 'mb-6'}>
      {devData != null ? <DevCopyJsonButton data={devData} /> : null}
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      {isTruncated ? (
        <p className="text-xs text-muted-foreground mb-3">
          {format(vi.listSampleHint, { limit: urls.length, total })}
        </p>
      ) : null}
      <GoogleTableToolbar
        searchPlaceholder={vi.searchPlaceholder}
        search={localSearch}
        onSearch={setLocalSearch}
        onExport={() =>
          exportCsv(filteredRows, exportColumns, `${title.replace(/\s+/g, '-').toLowerCase()}.csv`)
        }
        exportLabel={vi.exportCsv}
      />
      <div className="mt-2">
        <SortablePaginatedTable
          columns={columns}
          rows={filteredRows}
          defaultSort="url"
          defaultDir="asc"
          rowKeyField="url"
          emptyMessage={
            localSearch || globalSearch
              ? cg.noResults || 'No URLs match your search.'
              : cg.noData || 'No URLs in this category.'
          }
          paginationLabels={sp}
        />
      </div>
    </div>
  );
}
