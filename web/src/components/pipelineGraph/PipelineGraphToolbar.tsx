import { DraftInput } from '@/components/shared/DraftTextInput';
import { usePipelineGraph } from '@/context/PipelineGraphContext';

export default function PipelineGraphToolbar() {
  const { targetUrl, setTargetUrl, runPreview, previewing, save, saving, dirty, saveMessage } = usePipelineGraph();

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-default/60 bg-brand-900/80 px-4 py-3">
      <div className="min-w-0 max-w-xl flex-1">
        <DraftInput
          value={targetUrl}
          placeholder="https://example.com/page-to-preview"
          onCommit={setTargetUrl}
          className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      <button
        type="button"
        onClick={() => void runPreview()}
        disabled={previewing}
        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {previewing ? 'Running…' : 'Run Preview'}
      </button>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !dirty}
        className="shrink-0 rounded-lg border border-default px-4 py-2 text-sm font-medium text-foreground hover:bg-brand-800 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {saveMessage ? <span className="min-w-0 shrink truncate text-xs text-muted-foreground">{saveMessage}</span> : null}
    </div>
  );
}
