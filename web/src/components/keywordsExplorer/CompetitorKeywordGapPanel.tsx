'use client';

import { useMemo } from 'react';
import SortablePaginatedTable from '@/components/google/SortablePaginatedTable';
import { strings } from '@/lib/strings';
import type { CompetitorKeywordGapRow } from '@/types/report';
import type { TableColumn } from '@/types/components';

interface CompetitorKeywordGapPanelProps {
  rows: CompetitorKeywordGapRow[];
}

export default function CompetitorKeywordGapPanel({ rows }: CompetitorKeywordGapPanelProps) {
  const ke = strings.views.keywordsExplorer.competitorGap;
  const columns = useMemo((): TableColumn[] => [
    { key: 'keyword', label: ke.colKeyword, sortable: true },
    { key: 'competitor', label: ke.colCompetitor, sortable: true },
    { key: 'volume', label: ke.colVolume, sortable: true },
    { key: 'position', label: ke.colPosition, sortable: true },
    { key: 'url', label: ke.colUrl, sortable: false },
  ], [ke]);

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-4">{ke.empty}</p>;
  }

  return (
    <div className="p-4 border-t border-default">
      <h3 className="text-sm font-semibold text-foreground mb-1">{ke.title}</h3>
      <p className="text-xs text-muted-foreground mb-4">{ke.hint}</p>
      <SortablePaginatedTable
        columns={columns}
        rows={rows as Array<Record<string, unknown>>}
        defaultSort="volume"
        rowKeyField="keyword"
        emptyMessage={ke.empty}
        paginationLabels={strings.views.keywordsExplorer.table}
      />
    </div>
  );
}
