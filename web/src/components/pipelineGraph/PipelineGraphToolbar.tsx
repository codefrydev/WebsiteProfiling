import { DraftInput } from '@/components/shared/DraftTextInput';
import { usePipelineGraph } from '@/context/PipelineGraphContext';

export default function PipelineGraphToolbar() {
  const { targetUrl, setTargetUrl, runPreview, previewing, save, saving, dirty, saveMessage } = usePipelineGraph();

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/80 px-4 py-3">
      <div className="min-w-0 max-w-xl flex-1">
        <DraftInput
          value={targetUrl}
          placeholder="https://example.com/page-to-preview"
          onCommit={setTargetUrl}
          className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-4 py-2 text-sm text-md-sys-on-surface focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20 transition-colors"
        />
      </div>
      <button
        type="button"
        onClick={() => void runPreview()}
        disabled={previewing}
        className="press shrink-0 rounded-full bg-md-sys-primary px-5 py-2 text-sm font-medium text-md-sys-on-primary transition-all duration-200 hover:brightness-105 active:scale-[0.98] disabled:opacity-50 shadow-sm"
      >
        {previewing ? 'Running…' : 'Run Preview'}
      </button>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !dirty}
        className="press shrink-0 rounded-full border border-md-sys-outline-variant/50 bg-md-sys-surface-container-high/40 px-5 py-2 text-sm font-medium text-md-sys-on-surface transition-all duration-200 hover:bg-md-sys-surface-container-highest active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {saveMessage ? <span className="min-w-0 shrink truncate text-xs text-md-sys-on-surface-variant">{saveMessage}</span> : null}
    </div>
  );
}
