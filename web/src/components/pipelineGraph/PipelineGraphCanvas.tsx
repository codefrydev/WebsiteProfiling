import { useEffect, useRef } from 'react';
import { Background, Controls, ReactFlow, useNodesState, type Edge, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PipelineFlowNode, { type PipelineFlowNodeType } from '@/components/pipelineGraph/PipelineFlowNode';
import { usePipelineGraph } from '@/context/PipelineGraphContext';

const NODE_TYPES = { pipelineNode: PipelineFlowNode };

export default function PipelineGraphCanvas() {
  const { document, loading, moveNode, selectNode } = usePipelineGraph();
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineFlowNodeType>([]);
  const rfInstance = useRef<ReactFlowInstance<PipelineFlowNodeType> | null>(null);

  // React Flow owns node position locally during drag for smooth interaction;
  // re-seed from the document once the initial load resolves (it may carry
  // different positions than the client-side default). Drags persist back
  // into the document via onNodeDragStop below, so no further resync is
  // needed afterwards -- kind/id never change for the fixed 8-node set.
  //
  // The declarative `fitView` prop only fits once, at mount, against whatever
  // nodes exist then -- since nodes start empty until this load resolves, it
  // fits against nothing and never re-fits once the real 8 nodes arrive. Fit
  // imperatively instead, deferred a frame so the new nodes are measured first.
  useEffect(() => {
    if (loading) return;
    setNodes(
      document.nodes.map((n) => ({ id: n.id, type: 'pipelineNode', position: n.position, data: { kind: n.kind } })),
    );
    requestAnimationFrame(() => rfInstance.current?.fitView({ padding: 0.2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const edges: Edge[] = document.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => selectNode(node.id)}
        onNodeDragStop={(_event, node) => moveNode(node.id, node.position)}
        onPaneClick={() => selectNode(null)}
        nodeTypes={NODE_TYPES}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
