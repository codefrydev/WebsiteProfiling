'use client';

import { useOptionalPipeline } from '@/context/PipelineContext';
import { useOptionalReport } from '@/context/useReport';

export interface ActivePropertyContext {
  propertyId: number | null;
  reportId: number | null;
  /** Report `/meta` and pipeline config have both finished their initial load. */
  contextReady: boolean;
  metaLoaded: boolean;
  configLoaded: boolean;
}

/** Property + report ids for audit tools; waits for async config before treating ids as final. */
export function useActivePropertyContext(): ActivePropertyContext {
  const pipeline = useOptionalPipeline();
  const report = useOptionalReport();
  const configLoaded = pipeline?.configLoaded ?? false;
  const metaLoaded = report?.metaLoaded ?? true;
  const propertyId = Number(pipeline?.configState.active_property_id || 0) || null;
  const reportId = report?.selectedReportId ?? null;

  return {
    propertyId,
    reportId,
    contextReady: metaLoaded && configLoaded,
    metaLoaded,
    configLoaded,
  };
}
