import ConfigField from '@/components/pipeline/ConfigField';
import { NODE_TYPE_REGISTRY } from '@/components/pipelineGraph/nodeTypeRegistry';
import { usePipelineGraph } from '@/context/PipelineGraphContext';

/** Pure content -- the parent view owns width/border chrome for this side panel. */
export default function NodeConfigPanel() {
  const { selectedNode, setNodeConfigValue } = usePipelineGraph();

  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        Select a step on the canvas to configure it.
      </div>
    );
  }

  const def = NODE_TYPE_REGISTRY[selectedNode.kind];
  const Icon = def.icon;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{def.label}</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{def.description}</p>

      {def.configFields.length === 0 ? (
        <p className="text-xs text-muted-foreground">This step has no configurable options.</p>
      ) : (
        <div className="space-y-4">
          {def.configFields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={selectedNode.config[field.key]}
              onChange={(v) => setNodeConfigValue(selectedNode.id, field.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
