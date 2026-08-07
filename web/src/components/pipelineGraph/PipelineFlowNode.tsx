import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { NODE_TYPE_REGISTRY } from '@/components/pipelineGraph/nodeTypeRegistry';
import { usePipelineGraph } from '@/context/PipelineGraphContext';
import type { PipelineNodeCategory, PipelineNodeKind } from '@/types/pipelineGraph';

export type PipelineFlowNodeData = { kind: PipelineNodeKind };
export type PipelineFlowNodeType = Node<PipelineFlowNodeData, 'pipelineNode'>;

const CATEGORY_ACCENT: Record<PipelineNodeCategory, string> = {
  trigger: 'border-amber-500/50 bg-amber-500/10',
  fetch: 'border-sky-500/50 bg-sky-500/10',
  parse: 'border-violet-500/50 bg-violet-500/10',
  filter: 'border-rose-500/50 bg-rose-500/10',
  transform: 'border-teal-500/50 bg-teal-500/10',
  extract: 'border-emerald-500/50 bg-emerald-500/10',
  output: 'border-blue-500/50 bg-blue-500/10',
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
      className={`w-56 rounded-xl border-2 px-3 py-2.5 shadow-sm transition-shadow ${CATEGORY_ACCENT[def.category]} ${
        isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-brand-950' : ''
      } ${enabled ? '' : 'opacity-50'}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{def.label}</span>
        {def.optional ? (
          <button
            type="button"
            className="nodrag shrink-0 rounded-full border border-default px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setNodeEnabled(id, !enabled);
            }}
          >
            {enabled ? 'On' : 'Off'}
          </button>
        ) : null}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{def.description}</p>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!bg-muted-foreground" />
    </div>
  );
}

export default memo(PipelineFlowNode);
