'use client';

import { useMemo } from 'react';
import SortablePaginatedTable from '@/components/google/SortablePaginatedTable';
import { strings } from '@/lib/strings';
import type { CompetitorKeywordGapRow } from '@/types/report';
import type { TableColumn } from '@/types/components';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildKeywordGapContext } from '@/lib/fixSuggestionContext';

interface CompetitorKeywordGapPanelProps {
  rows: CompetitorKeywordGapRow[];
}

export default function CompetitorKeywordGapPanel({ rows }: CompetitorKeywordGapPanelProps) {
  const ke = strings.views.keywordsExplorer.competitorGap;
  const columns = useMemo((): TableColumn[] => [
    { key: 'keyword', label: ke.colKeyword },
    { key: 'competitor', label: ke.colCompetitor },
    { key: 'volume', label: ke.colVolume },
    { key: 'position', label: ke.colPosition },
    { key: 'url', label: ke.colUrl },
    {
      key: '_ai',
      label: '',
      render: (_v, row) => (
        <AiSuggestionButton request={buildKeywordGapContext(row as unknown as CompetitorKeywordGapRow)} />
      ),
    },
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
        rows={rows as unknown as Array<Record<string, unknown>>}
        defaultSort="volume"
        rowKeyField="keyword"
        emptyMessage={ke.empty}
        paginationLabels={strings.views.keywordsExplorer.table}
      />
    </div>
  );
}
