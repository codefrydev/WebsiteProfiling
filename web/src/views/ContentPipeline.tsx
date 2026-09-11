import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import ChatShell from '@/components/chat/ChatShell';
import ContentPipelineSidebar from '@/components/pipelineGraph/ContentPipelineSidebar';
import NodeConfigPanel from '@/components/pipelineGraph/NodeConfigPanel';
import PipelineGraphCanvas from '@/components/pipelineGraph/PipelineGraphCanvas';
import PipelineGraphToolbar from '@/components/pipelineGraph/PipelineGraphToolbar';
import PipelineNodePalette from '@/components/pipelineGraph/PipelineNodePalette';
import PipelinePreviewPanel from '@/components/pipelineGraph/PipelinePreviewPanel';
import { PipelineGraphProvider, usePipelineGraph } from '@/context/PipelineGraphContext';

type RightTab = 'config' | 'preview';

function RightPanel() {
  const [tab, setTab] = useState<RightTab>('config');

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40">
      <div className="flex shrink-0 border-b border-md-sys-outline-variant/40">
        {(['config', 'preview'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors ${
              tab === id
                ? 'border-b-2 border-link text-md-sys-primary font-semibold'
                : 'text-md-sys-on-surface-variant hover:text-md-sys-on-surface'
            }`}
          >
            {id}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === 'config' ? <NodeConfigPanel /> : <PipelinePreviewPanel />}</div>
    </div>
  );
}

function ContentPipelineBody() {
  const { loading, loadError } = usePipelineGraph();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-md-sys-on-surface-variant">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading pipeline…
      </div>
    );
  }

  return (
    <>
      {loadError ? (
        <div className="shrink-0 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          Failed to load saved settings: {loadError}. Showing an unsaved default pipeline.
        </div>
      ) : null}
      <PipelineGraphToolbar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PipelineNodePalette />
        <div className="min-w-0 flex-1">
          <PipelineGraphCanvas />
        </div>
        <RightPanel />
      </div>
    </>
  );
}

export default function ContentPipeline() {
  return (
    <ChatShell sidebar={(layout) => <ContentPipelineSidebar {...layout} />}>
      <div className="chat-main-panel">
        <header className="flex shrink-0 items-center gap-3 border-b border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/80 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-md-sys-on-surface">Content Pipeline</span>
            <span className="ml-2 hidden text-xs text-md-sys-on-surface-variant sm:inline">
              Design and preview the content-extraction pipeline
            </span>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PipelineGraphProvider>
            <ContentPipelineBody />
          </PipelineGraphProvider>
        </div>
      </div>
    </ChatShell>
  );
}
