
import { useEffect, useMemo } from 'react';
import { useReport } from '@/context/useReport';
import { getDataset } from '@/lib/dashboard/engine/datasets';
import { rowsForDataset, runQueryCached } from '@/lib/dashboard/engine/memo';
import { inferFields, mergeFields } from '@/lib/dashboard/engine/inferFields';
import type { DatasetDef, FieldDef, Filter, QuerySpec, QueryResult } from '@/lib/dashboard/engine/types';

export type WidgetStatus = 'loading' | 'loaded' | 'error';

interface DatasetRowsResult {
  def: DatasetDef | undefined;
  rows: Record<string, unknown>[];
  fields: FieldDef[];
  status: WidgetStatus;
}

/** Load a dataset's section (on demand) and return its rows + merged field catalog. */
export function useDatasetRows(datasetId: string): DatasetRowsResult {
  const { data, sectionStatus, loadSection, selectedReportId } = useReport();
  const def = getDataset(datasetId);

  useEffect(() => {
    if (def && data && sectionStatus[def.section] === undefined) {
      void loadSection(def.section, selectedReportId ?? null);
    }
  }, [def, data, sectionStatus, loadSection, selectedReportId]);

  const rows = useMemo(
    () => (def && data ? rowsForDataset(data, datasetId, selectedReportId ?? null) : []),
    [def, data, datasetId, selectedReportId],
  );
  const fields = useMemo(() => (def ? mergeFields(def.fields, inferFields(rows)) : []), [def, rows]);

  let status: WidgetStatus = 'loading';
  if (!def) status = 'error';
  else if (sectionStatus[def.section] === 'error') status = 'error';
  else if (sectionStatus[def.section] === 'loaded') status = 'loaded';

  return { def, rows, fields, status };
}

interface WidgetQueryResult {
  def: DatasetDef | undefined;
  status: WidgetStatus;
  result: QueryResult;
  fields: FieldDef[];
}

/** Run a widget's query against its (section-loaded) dataset rows, with memoization. */
export function useWidgetQuery(
  datasetId: string,
  spec: QuerySpec,
  injectedFilters?: Filter[],
): WidgetQueryResult {
  const { def, rows, fields, status } = useDatasetRows(datasetId);
  const effSpec = useMemo<QuerySpec>(
    () =>
      injectedFilters && injectedFilters.length
        ? { ...spec, filters: [...(spec.filters ?? []), ...injectedFilters] }
        : spec,
    [spec, injectedFilters],
  );
  const result = useMemo(() => runQueryCached(rows, effSpec), [rows, effSpec]);
  return { def, status, result, fields };
}
