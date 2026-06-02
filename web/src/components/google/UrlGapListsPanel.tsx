'use client';

import { useState, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { strings, format } from '../../lib/strings';
import { buildLinksInspectHref } from '../../lib/reportNav';
import { filterBySearch, exportCsv } from './tableUtils';
import GoogleTableToolbar from './GoogleTableToolbar';
import SortablePaginatedTable from './SortablePaginatedTable';
import type { TableColumn, UrlGapRow, UrlJoinData } from '@/types/components';

interface UrlGapSegment {
  key: string;
  label: string;
  rows: UrlGapRow[];
  total: number;
}

interface UrlGapListsPanelProps {
  urlJoin: UrlJoinData | null | undefined;
  searchParams?: URLSearchParams | string | null;
  showGsc?: boolean;
  showGa4?: boolean;
  showCrawl?: boolean;
}

/**
 * Segmented panel showing crawl_only / gsc_only / ga4_only URL gap lists.
 */
export default function UrlGapListsPanel({
  urlJoin,
  searchParams,
  showGsc = true,
  showGa4 = true,
  showCrawl = true,
}: UrlGapListsPanelProps) {
  const sp = strings.views.searchPerformance;
  const cg = strings.components.urlGapLists;

  const lists = urlJoin?.lists || {};
  const totals = urlJoin?.lists_total || {};
  const limit = urlJoin?.list_limit || 200;

  const segments = useMemo((): UrlGapSegment[] => {
    const out: UrlGapSegment[] = [];
    if (showGsc && lists.gsc_only) {
      out.push({
        key: 'gsc_only',
        label: cg.gscOnly || 'GSC only',
        rows: lists.gsc_only,
        total: totals.gsc_only || lists.gsc_only.length,
      });
    }
    if (showGa4 && lists.ga4_only) {
      out.push({
        key: 'ga4_only',
        label: cg.ga4Only || 'GA4 only',
        rows: lists.ga4_only,
        total: totals.ga4_only || lists.ga4_only.length,
      });
    }
    if (showCrawl && lists.crawl_only) {
      out.push({
        key: 'crawl_only',
        label: cg.crawlOnly || 'Crawl only',
        rows: lists.crawl_only,
        total: totals.crawl_only || lists.crawl_only.length,
      });
    }
    return out;
  }, [lists, totals, showGsc, showGa4, showCrawl, cg]);

  const [activeSegment, setActiveSegment] = useState(() => segments[0]?.key || 'gsc_only');
  const [search, setSearch] = useState('');

  const current = useMemo(
    () => segments.find((s) => s.key === activeSegment) || segments[0],
    [segments, activeSegment],
  );

  const filteredRows = useMemo(
    () => filterBySearch(current?.rows || [], search, 'url'),
    [current, search],
  );

  const paginationLabels = sp.table;

  const isTruncated = current && current.total > limit;

  const columns = useMemo((): TableColumn[] => {
    if (!current) return [];
    const cols: TableColumn[] = [
      {
        key: 'url',
        label: cg.columnUrl || 'URL',
        render: (v) => (
          <span className="font-mono text-xs break-all">{String(v ?? '')}</span>
        ),
      },
    ];
    if (current.key === 'gsc_only') {
      cols.push(
        {
          key: 'impressions',
          label: cg.columnImpressions || 'Impressions',
          render: (v) => (
            <span className="tabular-nums">
              {typeof v === 'number' ? v.toLocaleString() : '—'}
            </span>
          ),
        },
        {
          key: 'clicks',
          label: cg.columnClicks || 'Clicks',
          render: (v) => (
            <span className="tabular-nums">
              {typeof v === 'number' ? v.toLocaleString() : '—'}
            </span>
          ),
        },
      );
    }
    if (current.key === 'ga4_only') {
      cols.push({
        key: 'sessions',
        label: cg.columnSessions || 'Sessions',
        render: (v) => (
          <span className="tabular-nums">
            {typeof v === 'number' ? v.toLocaleString() : '—'}
          </span>
        ),
      });
    }
    cols.push({
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
    });
    return cols;
  }, [current, cg, searchParams]);

  const exportColumns = columns.filter((c) => c.key !== '_inspect');

  if (!segments.length) return null;

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {segments.map((seg) => (
          <button
            key={seg.key}
            type="button"
            onClick={() => { setActiveSegment(seg.key); setSearch(''); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeSegment === seg.key
                ? 'bg-brand-700 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-brand-800'
            }`}
          >
            {seg.label}
            <span className="ml-1.5 tabular-nums text-xs opacity-70">({seg.total.toLocaleString()})</span>
          </button>
        ))}
      </div>

      {isTruncated && current && (
        <p className="text-xs text-muted-foreground mb-3 px-1">
          {format(cg.truncatedHint || 'Showing top {limit} of {total} URLs.', {
            limit,
            total: current.total.toLocaleString(),
          })}
        </p>
      )}

      <GoogleTableToolbar
        searchPlaceholder={cg.searchPlaceholder || 'Search URLs…'}
        search={search}
        onSearch={setSearch}
        onExport={() => exportCsv(filteredRows, exportColumns, `${activeSegment}.csv`)}
        exportLabel={cg.exportCsv || 'Export CSV'}
      />

      <div className="mt-2">
        <SortablePaginatedTable
          columns={columns}
          rows={filteredRows}
          defaultSort={current?.key === 'gsc_only' ? 'impressions' : current?.key === 'ga4_only' ? 'sessions' : 'url'}
          defaultDir="desc"
          rowKeyField="url"
          emptyMessage={search ? (cg.noResults || 'No URLs match your search.') : (cg.noData || 'No URLs in this category.')}
          paginationLabels={paginationLabels}
        />
      </div>
    </div>
  );
}
