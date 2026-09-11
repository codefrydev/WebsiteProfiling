
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Search,
  X,
} from 'lucide-react';
import type { PipelineJobStatus } from '@/types/api';
import { strings } from '@/lib/strings';
import {
  filterPipelineLogLines,
  getPipelineLogStats,
  groupPipelineLogLines,
  parsePipelineLog,
  PHASE_CHIP_CLASS,
  PIPELINE_LOG_LINE_CLASS,
  type PipelineLogLine,
} from '@/lib/formatPipelineLog';

export interface PipelineLogViewerProps {
  log: string;
  autoScroll?: boolean;
  status?: PipelineJobStatus | '';
  logTruncated?: boolean;
  className?: string;
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const q = query.trim();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-full bg-md-sys-warning-container px-1.5 py-0.5 text-md-sys-on-warning-container">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ProgressLine({
  line,
  query,
  label = 'Progress',
}: {
  line: PipelineLogLine;
  query: string;
  label?: string;
}) {
  const p = line.progress;
  if (!p) {
    return (
      <span className={PIPELINE_LOG_LINE_CLASS.progress}>{highlightText(line.text, query)}</span>
    );
  }
  return (
    <div className="space-y-1.5 rounded-2xl border border-md-sys-primary/20 bg-md-sys-primary-container/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-md-sys-on-surface-variant">
        <span className="font-medium text-md-sys-primary">{label}</span>
        <span className="tabular-nums text-md-sys-on-surface/80">
          {p.current}/{p.total} ({p.percent}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-md-sys-surface-container-high/80">
        <div
          className="h-full rounded-full bg-md-sys-primary transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, p.percent))}%` }}
        />
      </div>
    </div>
  );
}

function ActivityLine({ line, query }: { line: PipelineLogLine; query: string }) {
  const url = line.progressEvent?.url ?? line.text.replace(/^→\s*/, '');
  return (
    <div className="space-y-1.5 py-1">
      <div
        className="truncate rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/50 px-2.5 py-1 font-mono text-[11px] text-md-sys-on-surface"
        title={url}
      >
        <span className="text-md-sys-primary">→ </span>
        {highlightText(url, query)}
      </div>
    </div>
  );
}

function LogLine({ line, query }: { line: PipelineLogLine; query: string }) {
  if (line.kind === 'noise') {
    return (
      <div className="my-1 rounded-xl border border-md-sys-warning/30 bg-md-sys-warning-container/20 px-2.5 py-1 font-mono text-xs leading-relaxed text-md-sys-on-warning-container">
        {highlightText(line.text, query)}
      </div>
    );
  }

  if (line.kind === 'activity') {
    return <ActivityLine line={line} query={query} />;
  }

  if (line.kind === 'progress') {
    return (
      <div className="py-1">
        <ProgressLine
          line={line}
          query={query}
          label={line.phase === 'crawl' ? 'Crawl progress' : 'Progress'}
        />
      </div>
    );
  }

  const colorClass = PIPELINE_LOG_LINE_CLASS[line.kind];
  const isErrorBlock = line.kind === 'error' || line.kind === 'traceback';

  if (line.kind === 'section') {
    const m = line.text.match(/^(\[[^\]]+\])(.*)$/);
    if (m) {
      return (
        <div
          className={`py-1 font-mono text-xs leading-relaxed ${colorClass} ${isErrorBlock ? 'border-l-2 border-md-sys-error/60 pl-2' : ''}`}
        >
          <span className="font-semibold text-md-sys-primary">{highlightText(m[1], query)}</span>
          <span className="text-md-sys-on-surface">{highlightText(m[2], query)}</span>
        </div>
      );
    }
  }

  return (
    <div
      className={`py-0.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words ${colorClass} ${
        isErrorBlock ? 'border-l-2 border-md-sys-error/50 pl-2' : ''
      }`}
    >
      {highlightText(line.text, query)}
    </div>
  );
}

function LogGroupBlock({
  label,
  phase,
  done,
  lines,
  query,
  defaultOpen,
  firstErrorId,
  errorRef,
}: {
  label: string;
  phase: PipelineLogLine['phase'];
  done: boolean;
  lines: PipelineLogLine[];
  query: string;
  defaultOpen: boolean;
  firstErrorId: number | null;
  errorRef: RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const chip = PHASE_CHIP_CLASS[phase];

  return (
    <section className="rounded-2xl border border-md-sys-outline-variant/50 bg-md-sys-surface-container-low/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-md-sys-surface-container/50 active:scale-[0.99]"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-md-sys-on-surface-variant transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip}`}>
          {label}
        </span>
        {done ? (
          <Check className="ml-auto h-3.5 w-3.5 text-md-sys-success" aria-hidden />
        ) : (
          <span className="ml-auto text-[10px] text-md-sys-on-surface-variant">{lines.length} lines</span>
        )}
      </button>
      {open ? (
        <div className="border-t border-md-sys-outline-variant/40 px-3 pb-2 pt-1">
          {lines.map((line) => (
            <div key={line.id} ref={line.id === firstErrorId ? errorRef : undefined}>
              <LogLine line={line} query={query} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function PipelineLogViewer({
  log,
  autoScroll = true,
  status = '',
  logTruncated = false,
  className = '',
}: PipelineLogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [hideNoise, setHideNoise] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [grouped, setGrouped] = useState(true);

  const allLines = useMemo(() => parsePipelineLog(log), [log]);
  const visibleLines = useMemo(
    () => filterPipelineLogLines(allLines, { query, hideNoise, errorsOnly }),
    [allLines, query, hideNoise, errorsOnly],
  );
  const groups = useMemo(() => groupPipelineLogLines(visibleLines), [visibleLines]);
  const stats = useMemo(() => getPipelineLogStats(allLines), [allLines]);
  const firstErrorId = useMemo(
    () => visibleLines.find((l) => l.kind === 'error' || l.kind === 'traceback')?.id ?? null,
    [visibleLines],
  );
  const isRunning = status === 'running' || status === 'starting';

  useEffect(() => {
    if (!autoScroll || !scrollRef.current || errorsOnly) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [log, autoScroll, visibleLines.length, errorsOnly]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([log], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const jumpToError = () => {
    errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const shellClass = expanded
    ? 'fixed inset-4 z-50 flex flex-col rounded-3xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low shadow-2xl'
    : 'relative';

  const logBody = (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-md-sys-on-surface-variant" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search log…"
            className="w-full rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low py-1.5 pl-8 pr-8 text-xs text-md-sys-on-surface placeholder:text-md-sys-on-surface-variant/60 focus:border-md-sys-primary focus:outline-none focus:ring-2 focus:ring-md-sys-primary/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="press absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-md-sys-on-surface-variant hover:text-md-sys-on-surface active:scale-90"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-md-sys-outline-variant/40 px-3 py-1.5 text-[11px] text-md-sys-on-surface-variant active:scale-[0.98]">
          <input
            type="checkbox"
            checked={hideNoise}
            onChange={(e) => setHideNoise(e.target.checked)}
            className="h-3 w-3 rounded border-md-sys-outline-variant/40"
          />
          Hide shutdown noise
        </label>
        <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-md-sys-outline-variant/40 px-3 py-1.5 text-[11px] text-md-sys-on-surface-variant active:scale-[0.98]">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
            className="h-3 w-3 rounded border-md-sys-outline-variant/40"
          />
          Errors only
        </label>
        <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-md-sys-outline-variant/40 px-3 py-1.5 text-[11px] text-md-sys-on-surface-variant active:scale-[0.98]">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
            className="h-3 w-3 rounded border-md-sys-outline-variant/40"
          />
          Group by step
        </label>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-md-sys-on-surface-variant">
          <span className="tabular-nums">
            {visibleLines.length}/{allLines.length} lines
          </span>
          {stats.errors > 0 ? (
            <span className="text-md-sys-error">{stats.errors} error line{stats.errors === 1 ? '' : 's'}</span>
          ) : null}
          {stats.warnings > 0 ? (
            <span className="text-md-sys-warning">{stats.warnings} warning{stats.warnings === 1 ? '' : 's'}</span>
          ) : null}
          {stats.noise > 0 ? (
            <span className={hideNoise ? 'italic opacity-70' : 'text-md-sys-on-surface-variant'}>
              {stats.noise} shutdown line{stats.noise === 1 ? '' : 's'}
              {hideNoise ? ' hidden' : ''}
            </span>
          ) : null}
          {isRunning ? (
            <span className="inline-flex items-center gap-1 text-md-sys-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              Live
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {stats.errors > 0 ? (
            <button
              type="button"
              onClick={jumpToError}
              className="press inline-flex items-center gap-1 rounded-full border border-md-sys-error/40 bg-md-sys-error-container/30 px-3 py-1 text-[11px] font-medium text-md-sys-on-error-container hover:bg-md-sys-error-container/50 active:scale-[0.98] transition-all"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Jump to error
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="press inline-flex items-center gap-1 rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/80 px-3 py-1 text-[11px] font-medium text-md-sys-on-surface-variant hover:bg-md-sys-surface-container hover:text-md-sys-on-surface active:scale-[0.98] transition-all"
          >
            {copied ? <Check className="h-3 w-3 text-md-sys-success" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="press inline-flex items-center gap-1 rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/80 px-3 py-1 text-[11px] font-medium text-md-sys-on-surface-variant hover:bg-md-sys-surface-container hover:text-md-sys-on-surface active:scale-[0.98] transition-all"
          >
            <Download className="h-3 w-3" aria-hidden />
            Download
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="press inline-flex items-center gap-1 rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/80 px-3 py-1 text-[11px] font-medium text-md-sys-on-surface-variant hover:bg-md-sys-surface-container hover:text-md-sys-on-surface active:scale-[0.98] transition-all"
          >
            {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {expanded ? 'Exit' : 'Expand'}
          </button>
        </div>
      </div>

      {stats.lastProgress?.progress && isRunning ? (
        <div className="mb-2 rounded-2xl border border-md-sys-primary/25 bg-md-sys-primary-container/10 px-3 py-2">
          <div className="mb-1 flex justify-between text-[11px] text-md-sys-on-surface-variant">
            <span>Latest progress</span>
            <span className="tabular-nums">
              {stats.lastProgress.progress.current}/{stats.lastProgress.progress.total} (
              {stats.lastProgress.progress.percent}%)
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-md-sys-surface-container-high/80">
            <div
              className="h-full rounded-full bg-md-sys-primary transition-[width] duration-300"
              style={{ width: `${stats.lastProgress.progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {logTruncated ? (
        <div className="mb-2 flex items-start gap-2 rounded-2xl border border-md-sys-warning/30 bg-md-sys-warning-container/20 px-3 py-2 text-xs text-md-sys-on-warning-container">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{strings.pipelineRunner.logTruncatedBanner}</span>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={`overflow-auto rounded-2xl border border-md-sys-outline-variant/40 bg-[#0d1117] p-3 sm:p-4 dark:bg-black/50 ${
          expanded ? 'min-h-0 flex-1' : 'max-h-[min(50vh,28rem)]'
        }`}
        role="log"
        aria-live="polite"
      >
        {visibleLines.length === 0 ? (
          <p className="text-xs text-md-sys-on-surface-variant">
            {allLines.length === 0 ? 'No output yet.' : 'No lines match your filters.'}
          </p>
        ) : grouped ? (
          <div className="space-y-2">
            {groups.map((group, i) => (
              <LogGroupBlock
                key={`${group.phase}-${group.label}-${i}`}
                label={group.label}
                phase={group.phase}
                done={group.done}
                lines={group.lines}
                query={query}
                defaultOpen={i === groups.length - 1 || !group.done}
                firstErrorId={firstErrorId}
                errorRef={errorRef}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-0">
            {visibleLines.map((line) => (
              <div key={line.id} ref={line.id === firstErrorId ? errorRef : undefined}>
                <LogLine line={line} query={query} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (expanded) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" aria-hidden onClick={() => setExpanded(false)} />
        <div className={shellClass}>
          <div className="flex items-center justify-between border-b border-md-sys-outline-variant/40 px-4 py-3">
            <span className="text-sm font-semibold text-md-sys-on-surface">{strings.pipelineRunner.outputTitle}</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="press rounded-full p-1.5 text-md-sys-on-surface-variant hover:bg-md-sys-surface-container hover:text-md-sys-on-surface active:scale-95"
              aria-label="Close expanded log"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4">{logBody}</div>
        </div>
      </>
    );
  }

  return <div className={`${shellClass} ${className}`.trim()}>{logBody}</div>;
}
