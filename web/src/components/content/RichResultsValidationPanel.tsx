'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components';
import Badge from '@/components/Badge';
import SortablePaginatedTable from '@/components/google/SortablePaginatedTable';
import { strings } from '@/lib/strings';
import type { RichResultsValidationRow } from '@/types/report';
import type { TableColumn } from '@/types/components';

interface RichResultsValidationPanelProps {
  rows: RichResultsValidationRow[];
}

function statusBadgeVariant(status: string): string {
  switch (status) {
    case 'pass':
      return 'success';
    case 'warning':
      return 'medium';
    case 'fail':
    case 'error':
      return 'critical';
    default:
      return 'info';
  }
}

export default function RichResultsValidationPanel({ rows }: RichResultsValidationPanelProps) {
  const vca = strings.views.contentAnalytics;
  const columns = useMemo((): TableColumn[] => [
    { key: 'url', label: vca.richResultsColUrl, sortable: true },
    {
      key: 'status',
      label: vca.richResultsColStatus,
      sortable: true,
      render: (row) => (
        <Badge variant={statusBadgeVariant(String(row.status || ''))} value={String(row.status || 'info')} />
      ),
    },
    { key: 'provenance', label: vca.richResultsColSource, sortable: true },
    { key: 'message', label: vca.richResultsColMessage, sortable: false },
  ], [vca]);

  if (!rows.length) return null;

  return (
    <Card padding="tight" shadow>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-400" />
        <h3 className="text-sm font-bold text-foreground">{vca.richResultsTitle}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{vca.richResultsHint}</p>
      <SortablePaginatedTable
        columns={columns}
        rows={rows as Array<Record<string, unknown>>}
        defaultSort="status"
        rowKeyField="url"
        emptyMessage={vca.richResultsEmpty}
        paginationLabels={strings.views.keywordsExplorer.table}
      />
    </Card>
  );
}
