
import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Layers, Settings2 } from 'lucide-react';
import { strings } from '@/lib/strings';
import {
  buildPipelineRunPreview,
  formatPipelineRunDuration,
} from '@/lib/pipelineRunPreview';
import { formatLivePipelineDuration, type LivePipelineEstimate } from '@/lib/pipelineLiveEstimate';
import type { PipelinePresetId } from '@/components/pipeline/pipelinePresets';
import type { CrawlPresetId } from '@/lib/crawlPresets';
import type { PipelineConfigState } from '@/types/api';

const s = strings.pipelineRunner.runPreview;

export interface PipelineRunPreviewCardProps {
  presetId: PipelinePresetId;
  configState: PipelineConfigState;
  customCommand?: string;
  crawlPresetId?: CrawlPresetId | '';
  liveEstimate?: LivePipelineEstimate | null;
}

export default function PipelineRunPreviewCard({
  presetId,
  configState,
  customCommand = '',
  crawlPresetId = '',
  liveEstimate = null,
}: PipelineRunPreviewCardProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const preview = buildPipelineRunPreview({
    presetId,
    configState,
    customCommand,
    crawlPresetId,
  });

  const isLive = liveEstimate != null && liveEstimate.source === 'live' && (liveEstimate.remainingMs ?? 0) > 0;
  const duration = isLive
    ? formatLivePipelineDuration(liveEstimate)
    : formatPipelineRunDuration(preview.timeMinSeconds, preview.timeMaxSeconds);

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-default bg-brand-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.hint}</p>
        </div>
        <div
          className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
            isLive
              ? 'border-green-500/35 bg-green-500/10 text-green-800 dark:text-green-200'
              : 'border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200'
          }`}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {isLive ? s.liveEstimatedTime : s.estimatedTime}: {duration}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-default bg-brand-800/60 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.maxPagesLabel}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {preview.maxCrawlPages != null ? preview.maxCrawlPages.toLocaleString() : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-default bg-brand-800/60 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.lighthousePagesLabel}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {preview.lighthousePages != null ? preview.lighthousePages.toLocaleString() : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-default bg-brand-800/60 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.stepsLabel}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {preview.phases.length}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {s.whatRunsLabel}
        </p>
        <ul className="space-y-2">
          {preview.phases.map((phase) => (
            <li
              key={phase.id}
              className="flex items-start gap-2 rounded-lg border border-default bg-brand-800/50 px-3 py-2"
            >
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{phase.label}</p>
                {phase.detail ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{phase.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
        {preview.summaryLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>{s.estimateDisclaimer}</li>
      </ul>

      {preview.configRows.length > 0 ? (
        <div className="rounded-lg border border-default bg-brand-800/40">
          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-foreground hover:bg-brand-800/80"
            aria-expanded={configOpen}
          >
            <span className="inline-flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {s.configPreviewLabel}
            </span>
            {configOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
          </button>
          {configOpen ? (
            <dl className="grid gap-2 border-t border-default px-3 py-3 sm:grid-cols-2">
              {preview.configRows.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
