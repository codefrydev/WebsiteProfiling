import { DEFAULT_NODE_ORDER, NODE_TYPE_REGISTRY } from '@/components/pipelineGraph/nodeTypeRegistry';
import { usePipelineGraph } from '@/context/PipelineGraphContext';

/** Informational in v1 -- the node set is fixed, so this isn't drag-to-create. Clicking an entry selects it on the canvas. */
export default function PipelineNodePalette() {
  const { selectedNodeId, selectNode } = usePipelineGraph();

  return (
    <div className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-default/60 bg-brand-900/40 p-3">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline steps</p>
      <ul className="space-y-1">
        {DEFAULT_NODE_ORDER.map((kind) => {
          const def = NODE_TYPE_REGISTRY[kind];
          const Icon = def.icon;
          const isSelected = selectedNodeId === kind;
          return (
            <li key={kind}>
              <button
                type="button"
                onClick={() => selectNode(kind)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-brand-700/60 text-foreground'
                    : 'text-muted-foreground hover:bg-brand-800/60 hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{def.label}</span>
                {def.optional ? (
                  <span className="shrink-0 rounded-full border border-default px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                    optional
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
