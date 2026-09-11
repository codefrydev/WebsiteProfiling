import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { usePipelineGraph } from '@/context/PipelineGraphContext';
import type { PipelinePreviewStepStatus } from '@/types/pipelineGraph';

function StepStatusIcon({ status }: { status: PipelinePreviewStepStatus }) {
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 shrink-0 text-md-sys-success" aria-hidden />;
  if (status === 'error') return <XCircle className="h-4 w-4 shrink-0 text-md-sys-error" aria-hidden />;
  return <MinusCircle className="h-4 w-4 shrink-0 text-md-sys-on-surface-variant" aria-hidden />;
}

/** Renders extract_structured_data's {field: value} output as rows; ignores non-object shapes defensively. */
function StepOutput({ output }: { output: unknown }) {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) return null;
  const entries = Object.entries(output as Record<string, unknown>);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1 border-t border-md-sys-outline-variant/40 pt-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-2 text-xs">
          <dt className="shrink-0 font-mono text-md-sys-on-surface-variant">{key}:</dt>
          <dd className="min-w-0 truncate font-mono text-md-sys-on-surface">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pure content -- the parent view owns width/border chrome for this side panel. */
export default function PipelinePreviewPanel() {
  const { previewing, previewError, previewResult } = usePipelineGraph();

  if (previewing) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-md-sys-on-surface-variant">
        Running preview…
      </div>
    );
  }

  if (!previewResult && !previewError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-md-sys-on-surface-variant">
        Enter a URL above and click Run Preview to see per-step results here.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {previewError ? (
        <div className="mb-4 rounded-xl border border-md-sys-error/40 bg-md-sys-error-container/20 px-3 py-2 text-xs text-md-sys-on-error-container">
          {previewError}
        </div>
      ) : null}

      {previewResult ? (
        <>
          <ul className="mb-4 space-y-1.5">
            {previewResult.steps.map((step) => (
              <li key={step.name} className="rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <StepStatusIcon status={step.status} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-md-sys-on-surface">{step.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-md-sys-on-surface-variant">{step.timingMs}ms</span>
                </div>
                {step.summary ? <p className="mt-1 text-xs text-md-sys-on-surface-variant">{step.summary}</p> : null}
                {step.error ? <p className="mt-1 text-xs text-md-sys-error">{step.error}</p> : null}
                <StepOutput output={step.output} />
              </li>
            ))}
          </ul>

          {previewResult.finalMetrics ? (
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 px-2 py-2">
                <p className="text-sm font-semibold text-md-sys-on-surface">{previewResult.finalMetrics.wordCount}</p>
                <p className="text-[10px] text-md-sys-on-surface-variant">Words</p>
              </div>
              <div className="rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 px-2 py-2">
                <p className="text-sm font-semibold text-md-sys-on-surface">
                  {previewResult.finalMetrics.readingLevel.toFixed(1)}
                </p>
                <p className="text-[10px] text-md-sys-on-surface-variant">Reading level</p>
              </div>
              <div className="rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 px-2 py-2">
                <p className="text-sm font-semibold text-md-sys-on-surface">
                  {previewResult.finalMetrics.topKeywords.length}
                </p>
                <p className="text-[10px] text-md-sys-on-surface-variant">Keywords</p>
              </div>
            </div>
          ) : null}

          {previewResult.finalMarkdown ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-md-sys-on-surface-variant">
                Final Markdown
              </p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/60 p-3 font-mono text-xs text-md-sys-on-surface">
                {previewResult.finalMarkdown}
              </pre>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
