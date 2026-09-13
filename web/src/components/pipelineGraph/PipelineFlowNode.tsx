import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { NODE_TYPE_REGISTRY } from '@/components/pipelineGraph/nodeTypeRegistry';
import { usePipelineGraph } from '@/context/PipelineGraphContext';
import type { PipelineNodeCategory, PipelineNodeKind } from '@/types/pipelineGraph';

export type PipelineFlowNodeData = { kind: PipelineNodeKind };
export type PipelineFlowNodeType = Node<PipelineFlowNodeData, 'pipelineNode'>;

const CATEGORY_ACCENT: Record<PipelineNodeCategory, string> = {
  trigger: 'border-md-sys-warning/40 bg-md-sys-warning-container/20',
  fetch: 'border-md-sys-info/40 bg-md-sys-info-container/20',
  parse: 'border-md-sys-tertiary/40 bg-md-sys-tertiary-container/20',
  filter: 'border-md-sys-error/40 bg-md-sys-error-container/20',
  transform: 'border-md-sys-secondary/40 bg-md-sys-secondary-container/20',
  extract: 'border-md-sys-success/40 bg-md-sys-success-container/20',
  output: 'border-md-sys-primary/40 bg-md-sys-primary-container/20',
};

/**
 * Renders as `data.kind` + a lookup into the shared document/registry rather
 * than carrying enabled/config in React Flow's own node data -- this node
 * subscribes to PipelineGraphContext directly, so it stays correct even
 * though React Flow's local `nodes` array is only re-seeded from the
 * document once (see PipelineGraphCanvas's load-resync effect).
 */
function PipelineFlowNode({ id, data, selected }: NodeProps<PipelineFlowNodeType>) {
  const { document, selectedNodeId, setNodeEnabled } = usePipelineGraph();
  const def = NODE_TYPE_REGISTRY[data.kind];
  const node = document.nodes.find((n) => n.id === id);
  const enabled = node?.enabled !== false;
  const Icon = def.icon;
  const isSelected = selected || selectedNodeId === id;

  return (
    <div
      className={`w-56 rounded-2xl border-2 px-3 py-2.5 shadow-sm transition-shadow ${CATEGORY_ACCENT[def.category]} ${
        isSelected ? 'ring-2 ring-md-sys-primary ring-offset-2 ring-offset-md-sys-surface-container-lowest' : ''
      } ${enabled ? '' : 'opacity-50'}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!bg-md-sys-on-surface-variant" />
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-md-sys-on-surface" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-md-sys-on-surface">{def.label}</span>
        {def.optional ? (
          <button
            type="button"
            className="nodrag shrink-0 rounded-full border border-md-sys-outline-variant/40 px-2 py-0.5 text-[10px] font-medium text-md-sys-on-surface-variant hover:text-md-sys-on-surface press active:scale-95 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              setNodeEnabled(id, !enabled);
            }}
          >
            {enabled ? 'On' : 'Off'}
          </button>
        ) : null}
      </div>
      <p className="mt-1 truncate text-[11px] text-md-sys-on-surface-variant">{def.description}</p>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!bg-md-sys-on-surface-variant" />
    </div>
  );
}

export default memo(PipelineFlowNode);
