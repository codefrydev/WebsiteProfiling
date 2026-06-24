
import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components';
import Badge from '@/components/Badge';
import SortablePaginatedTable from '@/components/google/SortablePaginatedTable';
import { strings, format } from '@/lib/strings';
import type { RichResultsMeta, RichResultsValidationRow } from '@/types/report';
import type { TableColumn } from '@/types/components';
import AiSuggestionButton from '@/components/ai/AiSuggestionButton';
import { buildRichResultsContext } from '@/lib/fixSuggestionContext';

interface RichResultsValidationPanelProps {
  rows: RichResultsValidationRow[];
  meta?: RichResultsMeta | null;
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

export default function RichResultsValidationPanel({ rows, meta }: RichResultsValidationPanelProps) {
  const vca = strings.views.contentAnalytics;
  const columns = useMemo((): TableColumn[] => [
    { key: 'url', label: vca.richResultsColUrl },
    {
      key: 'status',
      label: vca.richResultsColStatus,
      render: (v) => (
        <Badge variant={statusBadgeVariant(String(v || ''))} value={String(v || 'info')} />
      ),
    },
    { key: 'provenance', label: vca.richResultsColSource },
    { key: 'message', label: vca.richResultsColMessage },
    {
      key: '_ai',
      label: '',
      render: (_v, row) => (
        <AiSuggestionButton request={buildRichResultsContext(row as unknown as RichResultsValidationRow)} />
      ),
    },
  ], [vca]);

  if (!rows.length) return null;

  const heuristicOnly =
    meta != null &&
    (meta.heuristic_count ?? 0) > 0 &&
    (meta.gsc_count ?? 0) === 0 &&
    (meta.api_count ?? 0) === 0;

  return (
    <Card padding="tight" shadow>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-400" />
        <h3 className="text-sm font-bold text-foreground">{vca.richResultsTitle}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{vca.richResultsHint}</p>
      {meta && (meta.checked ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground mb-2">
          {format(vca.richResultsMeta, {
            gsc: meta.gsc_count ?? 0,
            api: meta.api_count ?? 0,
            heuristic: meta.heuristic_count ?? 0,
          })}
        </p>
      ) : null}
      {heuristicOnly ? (
        <p className="text-xs text-amber-700 dark:text-amber-300 mb-4">{vca.richResultsUpgradeHint}</p>
      ) : (
        <div className="mb-4" />
      )}
      <SortablePaginatedTable
        columns={columns}
        rows={rows as unknown as Array<Record<string, unknown>>}
        defaultSort="status"
        rowKeyField="url"
        emptyMessage={vca.richResultsEmpty}
        paginationLabels={strings.views.keywordsExplorer.table}
      />
    </Card>
  );
}
