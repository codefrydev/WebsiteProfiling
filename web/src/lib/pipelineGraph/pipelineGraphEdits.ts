/**
 * Pure, immutable edits to a PipelineGraphDocument, driven by the canvas UI.
 * Mirrors the withX(spec, ...) => spec style in lib/dashboard/builder/specEdits.ts.
 *
 * Node add/remove is deliberately absent: the editor's node set is a fixed
 * 8-step sequence (see PipelineNodeKind), not an arbitrary rewireable graph --
 * the only per-node lifecycle knob is `enabled` (see withNodeEnabled).
 */
import type { PipelineGraphDocument, PipelineGraphNode, PipelineNodePosition } from '@/types/pipelineGraph';

function withNode(
  doc: PipelineGraphDocument,
  nodeId: string,
  update: (node: PipelineGraphNode) => PipelineGraphNode,
): PipelineGraphDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? update(n) : n)),
  };
}

export function withNodeMoved(
  doc: PipelineGraphDocument,
  nodeId: string,
  position: PipelineNodePosition,
): PipelineGraphDocument {
  return withNode(doc, nodeId, (n) => ({ ...n, position }));
}

export function withNodeEnabled(
  doc: PipelineGraphDocument,
  nodeId: string,
  enabled: boolean,
): PipelineGraphDocument {
  return withNode(doc, nodeId, (n) => ({ ...n, enabled }));
}

export function withNodeConfigValue(
  doc: PipelineGraphDocument,
  nodeId: string,
  key: string,
  value: string | boolean,
): PipelineGraphDocument {
  return withNode(doc, nodeId, (n) => ({ ...n, config: { ...n.config, [key]: value } }));
}
