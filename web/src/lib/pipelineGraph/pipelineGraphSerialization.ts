/**
 * Builds the default 8-node pipeline document and normalizes documents
 * loaded from the backend, tolerating missing/partial/malformed saves.
 */
import { DEFAULT_NODE_ORDER } from '@/components/pipelineGraph/nodeTypeRegistry';
import { withNodeConfigValue } from '@/lib/pipelineGraph/pipelineGraphEdits';
import type {
  PipelineGraphDocument,
  PipelineGraphEdge,
  PipelineGraphNode,
  PipelineNodeKind,
  PipelinePreviewRequest,
} from '@/types/pipelineGraph';

const NODE_X_SPACING = 240;
const NODE_Y = 120;

function edgeId(source: string, target: string): string {
  return `${source}->${target}`;
}

/** The mockup's fixed 8-node chain, laid out left-to-right with empty config (registry defaults apply). */
export function buildInitialPipelineGraphDocument(): PipelineGraphDocument {
  const nodes: PipelineGraphNode[] = DEFAULT_NODE_ORDER.map((kind, i) => ({
    id: kind,
    kind,
    position: { x: i * NODE_X_SPACING, y: NODE_Y },
    config: {},
  }));
  const edges: PipelineGraphEdge[] = DEFAULT_NODE_ORDER.slice(1).map((kind, i) => {
    const source = DEFAULT_NODE_ORDER[i];
    return { id: edgeId(source, kind), source, target: kind };
  });
  return { version: 1, nodes, edges };
}

const KNOWN_KINDS = new Set<string>(DEFAULT_NODE_ORDER);

function isPipelineNodeKind(value: unknown): value is PipelineNodeKind {
  return typeof value === 'string' && KNOWN_KINDS.has(value);
}

function normalizeNode(raw: unknown): PipelineGraphNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isPipelineNodeKind(r.kind)) return null;

  const id = typeof r.id === 'string' && r.id ? r.id : r.kind;
  const pos = typeof r.position === 'object' && r.position !== null ? (r.position as Record<string, unknown>) : {};
  const x = typeof pos.x === 'number' ? pos.x : 0;
  const y = typeof pos.y === 'number' ? pos.y : 0;
  const config =
    typeof r.config === 'object' && r.config !== null && !Array.isArray(r.config)
      ? (r.config as Record<string, string | boolean>)
      : {};

  const node: PipelineGraphNode = { id, kind: r.kind, position: { x, y }, config };
  // undefined/true = always on (see PipelineGraphNode.enabled doc comment) --
  // only record `enabled: false` explicitly, never a redundant `enabled: true`.
  if (r.enabled === false) node.enabled = false;
  return node;
}

function normalizeEdge(raw: unknown, validNodeIds: Set<string>): PipelineGraphEdge | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.source !== 'string' || typeof r.target !== 'string') return null;
  if (!validNodeIds.has(r.source) || !validNodeIds.has(r.target)) return null;
  const id = typeof r.id === 'string' && r.id ? r.id : edgeId(r.source, r.target);
  return { id, source: r.source, target: r.target };
}

/**
 * Falls back to the default document whenever nodes are absent entirely (e.g.
 * a fresh property with nothing saved yet), and drops individually-malformed
 * nodes/edges rather than failing the whole load.
 */
export function normalizePipelineGraphDocument(raw: unknown): PipelineGraphDocument {
  if (typeof raw !== 'object' || raw === null) return buildInitialPipelineGraphDocument();
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.nodes) || r.nodes.length === 0) return buildInitialPipelineGraphDocument();

  const nodes = r.nodes.map(normalizeNode).filter((n): n is PipelineGraphNode => n !== null);
  if (nodes.length === 0) return buildInitialPipelineGraphDocument();

  const validIds = new Set(nodes.map((n) => n.id));
  const edges = Array.isArray(r.edges)
    ? r.edges.map((e) => normalizeEdge(e, validIds)).filter((e): e is PipelineGraphEdge => e !== null)
    : [];

  return { version: 1, nodes, edges };
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Flat crawl_settings columns (see config/typed_config_manifest.json) that the
// crawler itself reads directly -- these are the source of truth for their
// node's config value, distinct from pipeline_graph_json which only owns
// canvas layout (positions/enabled-flags) and has no other representation.
const MAIN_CONTENT_SELECTORS_KEY = 'main_content_selectors';
const BOILERPLATE_SELECTORS_KEY = 'boilerplate_selectors';
const CUSTOM_EXTRACTORS_KEY = 'custom_extractors';
export const PIPELINE_GRAPH_JSON_KEY = 'pipeline_graph_json';

/**
 * Overlays the flat crawl_settings fields onto their corresponding node
 * config keys, taking priority over whatever the opaque pipeline_graph_json
 * blob had -- keeps a single source of truth for fields that actually affect
 * crawl behavior in case the two ever disagree (e.g. edited outside this UI).
 */
export function applyFlatCrawlFields(
  doc: PipelineGraphDocument,
  flat: Record<string, unknown>,
): PipelineGraphDocument {
  let next = doc;
  const mainContentSelectors = flat[MAIN_CONTENT_SELECTORS_KEY];
  if (typeof mainContentSelectors === 'string' && mainContentSelectors) {
    next = withNodeConfigValue(next, 'parse.detect_landmarks', 'selector_priority', mainContentSelectors);
  }
  const boilerplateSelectors = flat[BOILERPLATE_SELECTORS_KEY];
  if (typeof boilerplateSelectors === 'string' && boilerplateSelectors) {
    next = withNodeConfigValue(next, 'filter.strip_boilerplate', 'boilerplate_selectors', boilerplateSelectors);
  }
  const customExtractors = flat[CUSTOM_EXTRACTORS_KEY];
  if (typeof customExtractors === 'string' && customExtractors) {
    next = withNodeConfigValue(next, 'extract.structured_data', 'custom_extractors_json', customExtractors);
  }
  return next;
}

/** Inverse of applyFlatCrawlFields, plus the full document under pipeline_graph_json for layout round-tripping. */
export function toFlatCrawlFieldsPatch(doc: PipelineGraphDocument): Record<string, string> {
  const byKind = new Map(doc.nodes.map((n) => [n.kind, n]));
  const patch: Record<string, string> = { [PIPELINE_GRAPH_JSON_KEY]: JSON.stringify(doc) };

  const landmarks = byKind.get('parse.detect_landmarks');
  if (typeof landmarks?.config.selector_priority === 'string') {
    patch[MAIN_CONTENT_SELECTORS_KEY] = landmarks.config.selector_priority;
  }
  const strip = byKind.get('filter.strip_boilerplate');
  if (typeof strip?.config.boilerplate_selectors === 'string') {
    patch[BOILERPLATE_SELECTORS_KEY] = strip.config.boilerplate_selectors;
  }
  const structured = byKind.get('extract.structured_data');
  if (typeof structured?.config.custom_extractors_json === 'string') {
    patch[CUSTOM_EXTRACTORS_KEY] = structured.config.custom_extractors_json;
  }
  return patch;
}

/**
 * Builds a /api/pipeline-preview request body from the current document plus
 * a fetch target. A disabled "Extract Structured Data" node omits
 * customExtractors entirely so the backend reports that step as skipped.
 */
export function buildPipelinePreviewRequest(
  doc: PipelineGraphDocument,
  target: { url?: string; html?: string },
): PipelinePreviewRequest {
  const byKind = new Map(doc.nodes.map((n) => [n.kind, n]));
  const request: PipelinePreviewRequest = {};
  if (target.url) request.url = target.url;
  if (target.html) request.html = target.html;

  const landmarks = byKind.get('parse.detect_landmarks');
  if (typeof landmarks?.config.selector_priority === 'string' && landmarks.config.selector_priority) {
    request.mainContentSelectors = landmarks.config.selector_priority;
  }
  const strategy = landmarks?.config.fallback_strategy;
  if (strategy === 'main_only' || strategy === 'full_body') {
    request.contentAnalysisStrategy = strategy;
  }

  const strip = byKind.get('filter.strip_boilerplate');
  if (typeof strip?.config.boilerplate_selectors === 'string' && strip.config.boilerplate_selectors) {
    request.boilerplateSelectors = strip.config.boilerplate_selectors;
  }

  const structured = byKind.get('extract.structured_data');
  if (structured && structured.enabled !== false && typeof structured.config.custom_extractors_json === 'string') {
    const parsed = safeJsonParse(structured.config.custom_extractors_json);
    if (Array.isArray(parsed)) {
      request.customExtractors = parsed.filter(
        (e): e is Record<string, unknown> => typeof e === 'object' && e !== null,
      );
    }
  }

  return request;
}
