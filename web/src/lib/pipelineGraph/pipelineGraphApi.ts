/**
 * Loads/saves the pipeline graph through the existing /api/pipeline-settings
 * endpoint (same one PipelineContext uses) rather than a dedicated route --
 * the graph's flat fields (main_content_selectors, etc.) live in the same
 * crawl_settings row as the unrelated SEO-audit fields that page edits, so
 * saving must merge into the full state rather than replace it.
 */
import { apiFetch, apiUrl, readApiErrorMessage } from '@/lib/publicBase';
import {
  applyFlatCrawlFields,
  buildInitialPipelineGraphDocument,
  normalizePipelineGraphDocument,
  safeJsonParse,
  toFlatCrawlFieldsPatch,
  PIPELINE_GRAPH_JSON_KEY,
} from '@/lib/pipelineGraph/pipelineGraphSerialization';
import type { PipelineConfigState } from '@/types/api';
import type { PipelineGraphDocument, PipelinePreviewRequest, PipelinePreviewResponse } from '@/types/pipelineGraph';

export interface LoadedPipelineGraph {
  document: PipelineGraphDocument;
  /** The full flat /api/pipeline-settings state, kept around so save() can merge into it. */
  rawState: PipelineConfigState;
}

export async function loadPipelineGraph(): Promise<LoadedPipelineGraph> {
  const res = await apiFetch(apiUrl('/pipeline-settings'));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(readApiErrorMessage(data, res));

  const rawState = (data.state || {}) as PipelineConfigState;
  const graphJson = rawState[PIPELINE_GRAPH_JSON_KEY];
  const parsed = typeof graphJson === 'string' && graphJson.trim() ? safeJsonParse(graphJson) : null;
  const document = applyFlatCrawlFields(
    parsed ? normalizePipelineGraphDocument(parsed) : buildInitialPipelineGraphDocument(),
    rawState,
  );
  return { document, rawState };
}

export async function savePipelineGraph(document: PipelineGraphDocument, rawState: PipelineConfigState): Promise<void> {
  const nextState: PipelineConfigState = { ...rawState, ...toFlatCrawlFieldsPatch(document) };
  const res = await apiFetch(apiUrl('/pipeline-settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: nextState }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(readApiErrorMessage(data, res));
}

export async function runPipelinePreview(request: PipelinePreviewRequest): Promise<PipelinePreviewResponse> {
  const res = await apiFetch(apiUrl('/pipeline-preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(readApiErrorMessage(data, res));
  return data as PipelinePreviewResponse;
}
