/** Types for the visual content-extraction pipeline editor. */

/** Palette category -- drives palette grouping and node accent color. */
export type PipelineNodeCategory =
  | 'trigger'
  | 'fetch'
  | 'parse'
  | 'filter'
  | 'transform'
  | 'extract'
  | 'output';

/**
 * Fixed catalog of node "kinds" the editor supports. Closed union (not an
 * open string) because kind drives which config-field schema applies --
 * see nodeTypeRegistry.ts.
 */
export type PipelineNodeKind =
  | 'trigger.on_page_load'
  | 'fetch.get_html'
  | 'parse.detect_landmarks'
  | 'filter.strip_boilerplate'
  | 'extract.main_content'
  | 'extract.structured_data'
  | 'transform.convert_markdown'
  | 'output.clean_content';

/** Canvas position, persisted so layout survives reload (matches React Flow's node.position shape). */
export interface PipelineNodePosition {
  x: number;
  y: number;
}

/**
 * One pipeline step. `config` deliberately matches PipelineConfigState's
 * shape (Record<string, string | boolean>) rather than introducing a wider
 * value type -- list-shaped fields (selector priority lists, include/exclude
 * chips) are stored as comma-joined strings, exactly like ConfigField's
 * existing 'multiselect' type already does, so no changes are needed to the
 * shared ConfigField prop types.
 */
export interface PipelineGraphNode {
  id: string;
  kind: PipelineNodeKind;
  /** Steps a user can turn off (e.g. "Extract Structured Data"); undefined/true = always on. */
  enabled?: boolean;
  position: PipelineNodePosition;
  config: Record<string, string | boolean>;
}

/** A connection between two steps. In the fixed-sequence editor this is
 * derived from node order, not user-drawn, but is modeled explicitly so (a)
 * React Flow has edges to render and (b) the shape survives if branching is
 * ever added later without a breaking schema change. */
export interface PipelineGraphEdge {
  id: string;
  source: string; // PipelineGraphNode.id
  target: string; // PipelineGraphNode.id
}

/** Whole persisted/loaded pipeline document. */
export interface PipelineGraphDocument {
  /** Schema version for forward compatibility (bump on breaking config shape changes). */
  version: 1;
  nodes: PipelineGraphNode[];
  edges: PipelineGraphEdge[];
}

// ── Preview request/response -- mirrors POST /api/pipeline-preview exactly ──

export interface PipelinePreviewRequest {
  url?: string;
  html?: string;
  mainContentSelectors?: string;
  boilerplateSelectors?: string;
  customExtractors?: Record<string, unknown>[];
  contentAnalysisStrategy?: 'main_only' | 'full_body';
}

export type PipelinePreviewStepStatus = 'success' | 'error' | 'skipped';

export interface PipelinePreviewStep {
  name: string;
  status: PipelinePreviewStepStatus;
  timingMs: number;
  summary?: string;
  error?: string;
  matchedSelector?: string | null;
  output?: unknown;
}

export interface PipelinePreviewKeyword {
  word: string;
  count: number;
  score: number;
}

export interface PipelinePreviewMetrics {
  wordCount: number;
  readingLevel: number;
  topKeywords: PipelinePreviewKeyword[];
}

export interface PipelinePreviewResponse {
  status: 'success' | 'error';
  steps: PipelinePreviewStep[];
  finalMarkdown?: string;
  finalMetrics?: PipelinePreviewMetrics;
  error?: string;
}
