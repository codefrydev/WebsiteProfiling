export type PipelineLogLineKind =
  | 'section'
  | 'progress'
  | 'activity'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'traceback'
  | 'noise'
  | 'plain';

export type PipelinePhase =
  | 'config'
  | 'crawl'
  | 'lighthouse'
  | 'report'
  | 'keywords'
  | 'plot'
  | 'optional'
  | 'other';

export type ProgressPhase = PipelinePhase;

export interface PipelineProgressEvent {
  phase: ProgressPhase;
  step: string;
  ts: number;
  current?: number;
  total?: number;
  url?: string;
  message?: string;
  elapsed_ms?: number;
  avg_ms?: number;
}

export interface PipelineEtaResult {
  remainingMs: number | null;
  ratePerSec: number | null;
  elapsedMs: number | null;
  percent: number | null;
}

const PROGRESS_PREFIX = '@progress ';

export interface PipelineLogLine {
  id: number;
  text: string;
  kind: PipelineLogLineKind;
  phase: PipelinePhase;
  progress?: { percent: number; current: number; total: number };
  /** Set when line was derived from a structured @progress event. */
  progressEvent?: PipelineProgressEvent;
}

export interface PipelineLogGroup {
  phase: PipelinePhase;
  label: string;
  lines: PipelineLogLine[];
  done: boolean;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export const PHASE_LABELS: Record<PipelinePhase, string> = {
  config: 'Settings',
  crawl: 'Crawl',
  lighthouse: 'Lighthouse',
  report: 'Site audit',
  keywords: 'Keywords',
  plot: 'Charts',
  optional: 'Optional audits',
  other: 'Output',
};

const STEP_LABELS: Record<string, string> = {
  start: 'Starting',
  done: 'Complete',
  fetch: 'Fetching pages',
  audit: 'Running audits',
  load_crawl: 'Loading crawl data',
  load_data: 'Loading crawl data',
  build_edges: 'Building link graph',
  write_db: 'Saving link graph',
  link_edges: 'Loading link edges',
  seo_summary: 'SEO summary',
  site_level: 'Site-level checks',
  contact_intelligence: 'Contact intelligence',
  subdomains: 'Subdomain inventory',
  security_scan: 'Security scan',
  content_analysis: 'Content analysis',
  categories: 'Building categories',
  content_analytics: 'Content analytics',
  write_payload: 'Saving report',
};

export const PIPELINE_STEPPER_PHASES: ProgressPhase[] = [
  'config',
  'crawl',
  'lighthouse',
  'report',
  'keywords',
  'plot',
];

/** Strip ANSI escapes and tqdm control chars. */
export function stripAnsi(raw: string): string {
  return raw.replace(ANSI_RE, '').replace(/\x1b\].*?\x07/g, '');
}

export function phaseFromSectionTag(tag: string): PipelinePhase {
  const t = tag.toLowerCase();
  if (t.includes('config')) return 'config';
  if (t.includes('crawl')) return 'crawl';
  if (t.includes('lighthouse')) return 'lighthouse';
  if (t.includes('report')) return 'report';
  if (t.includes('plot')) return 'plot';
  return 'other';
}

function classifyLine(line: string): PipelineLogLineKind {
  const t = line.trim();
  if (!t) return 'plain';
  if (t.startsWith(PROGRESS_PREFIX)) return 'noise';
  if (/^Exception ignored while calling deallocator/i.test(t)) return 'noise';
  if (/PythonFinalizationError|cannot join thread at interpreter shutdown/i.test(t)) {
    return 'noise';
  }
  if (/^Traceback\b|^Exception\b/i.test(t) || /\bError:\s/.test(t)) return 'error';
  if (/^\s*File "/.test(line) || /^\s+at /.test(line)) return 'traceback';
  if (/^\[[\w\s]+\]/.test(t)) return 'section';
  if (/\bDone\.?\s*$/i.test(t) || /\bcomplete\.?\s*$/i.test(t) || /written:/i.test(t)) return 'success';
  if (/warning/i.test(t)) return 'warning';
  if (/^\[Config\]/i.test(t) || /^Site Audit:/i.test(t) || /^WebsiteProfiling pipeline:/i.test(t)) return 'info';
  if (/\d+%\|/.test(t) || /^Pages:\s*\d+%/.test(t)) return 'progress';
  return 'plain';
}

function parseTqdmProgress(line: string): PipelineLogLine['progress'] | undefined {
  const m = line.match(/(\d+)%\|[^|]*\|\s*(\d+)\/(\d+)/);
  if (!m) return undefined;
  const percent = Number(m[1]);
  const current = Number(m[2]);
  const total = Number(m[3]);
  if (!Number.isFinite(percent) || !Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return undefined;
  }
  return { percent, current, total };
}

function markNoiseRun(lines: PipelineLogLine[]): PipelineLogLine[] {
  let inNoise = false;
  return lines.map((line) => {
    if (line.kind === 'noise' || /^Exception ignored while calling deallocator/i.test(line.text)) {
      inNoise = true;
      return { ...line, kind: 'noise' as const };
    }
    if (inNoise) {
      if (line.kind === 'section' && !/deallocator/i.test(line.text)) {
        inNoise = false;
        return line;
      }
      if (line.kind === 'success' && !line.text.includes('psycopg')) {
        inNoise = false;
        return line;
      }
      return { ...line, kind: 'noise' as const };
    }
    return line;
  });
}

function assignPhases(lines: PipelineLogLine[]): PipelineLogLine[] {
  let phase: PipelinePhase = 'config';
  return lines.map((line) => {
    if (line.kind === 'section') {
      const m = line.text.match(/^\[([^\]]+)\]/);
      if (m) phase = phaseFromSectionTag(m[1]);
    } else if (line.kind === 'info' && /pipeline:/i.test(line.text)) {
      phase = 'config';
    }
    return { ...line, phase };
  });
}

function collapseConsecutiveProgress(lines: PipelineLogLine[]): PipelineLogLine[] {
  const out: PipelineLogLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === 'progress') {
      let last = lines[i];
      i += 1;
      while (i < lines.length && lines[i].kind === 'progress') {
        last = lines[i];
        i += 1;
      }
      out.push(last);
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }
  return out;
}

function parseProgressPayload(line: string): PipelineProgressEvent | null {
  const t = line.trim();
  if (!t.startsWith(PROGRESS_PREFIX)) return null;
  try {
    const parsed = JSON.parse(t.slice(PROGRESS_PREFIX.length)) as PipelineProgressEvent;
    if (!parsed || typeof parsed.phase !== 'string' || typeof parsed.step !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Extract structured @progress events from raw log text. */
export function parsePipelineProgressEvents(raw: string): PipelineProgressEvent[] {
  const cleaned = stripAnsi(raw);
  const events: PipelineProgressEvent[] = [];
  for (const physical of cleaned.split('\n')) {
    const segments = physical.split('\r');
    const line = (segments[segments.length - 1] ?? '').trim();
    const evt = parseProgressPayload(line);
    if (evt) events.push(evt);
  }
  return events;
}

export function extractLatestProgress(events: PipelineProgressEvent[]): PipelineProgressEvent | null {
  if (!events.length) return null;
  return events[events.length - 1] ?? null;
}

export type PipelineJobStatus = 'starting' | 'running' | 'success' | 'error' | '';

/** Pick the progress snapshot to show in the header (respects finished jobs). */
export function resolveActiveProgress(
  events: PipelineProgressEvent[],
  jobStatus: PipelineJobStatus = '',
): PipelineProgressEvent | null {
  if (!events.length) return null;
  const latest = events[events.length - 1]!;
  if (jobStatus === 'success') {
    if (latest.step === 'start') {
      return {
        ...latest,
        step: 'done',
        message: latest.message?.replace(/\bstarting\b/i, 'complete') ?? `${latest.phase} complete`,
      };
    }
    const lastDone = [...events].reverse().find((e) => e.step === 'done');
    if (lastDone) return lastDone;
  }
  if (jobStatus === 'error' && latest.step === 'start') {
    const lastDone = [...events].reverse().find((e) => e.step === 'done' && e.phase === latest.phase);
    if (lastDone) return lastDone;
  }
  return latest;
}

function phaseFromProgressEvent(phase: string): PipelinePhase {
  const p = phase.toLowerCase();
  if (p === 'config' || p === 'crawl' || p === 'lighthouse' || p === 'report' || p === 'keywords' || p === 'plot') {
    return p;
  }
  if (p === 'optional') return 'optional';
  return 'other';
}

function progressEventToLogLine(evt: PipelineProgressEvent, id: number): PipelineLogLine {
  const phase = phaseFromProgressEvent(evt.phase);
  const label = PHASE_LABELS[phase] ?? evt.phase;
  const stepText = stepLabel(evt.step, evt.message);

  if (evt.step === 'start') {
    return {
      id,
      text: `[${label}] ${stepText}`,
      kind: 'section',
      phase,
      progressEvent: evt,
    };
  }

  if (evt.step === 'done') {
    return {
      id,
      text: `[${label}] ${stepText}`,
      kind: 'success',
      phase,
      progressEvent: evt,
    };
  }

  const hasCounts =
    evt.current != null && evt.total != null && evt.total > 0;
  const progress = hasCounts
    ? {
        percent: Math.min(100, Math.round(((evt.current ?? 0) / (evt.total ?? 1)) * 100)),
        current: evt.current ?? 0,
        total: evt.total ?? 0,
      }
    : undefined;

  if (evt.step === 'fetch' && evt.url) {
    const countSuffix = hasCounts ? ` (${evt.current}/${evt.total})` : '';
    return {
      id,
      text: `→ ${evt.url}${countSuffix}`,
      kind: 'activity',
      phase,
      progress,
      progressEvent: evt,
    };
  }

  if (hasCounts) {
    return {
      id,
      text: `${stepText} ${evt.current}/${evt.total}`,
      kind: 'progress',
      phase,
      progress,
      progressEvent: evt,
    };
  }

  return {
    id,
    text: `[${label}] ${stepText}`,
    kind: 'info',
    phase,
    progressEvent: evt,
  };
}


export function stepLabel(step: string, message?: string): string {
  if (message?.trim()) return message.trim();
  return STEP_LABELS[step] ?? step.replace(/_/g, ' ');
}

/** Rolling ETA from progress event history (last 10 samples with current+total). */
export function computeEta(
  latest: PipelineProgressEvent | null,
  history: PipelineProgressEvent[],
): PipelineEtaResult {
  if (!latest) {
    return { remainingMs: null, ratePerSec: null, elapsedMs: null, percent: null };
  }
  const elapsedMs = latest.elapsed_ms ?? null;
  let percent: number | null = null;
  if (
    latest.current != null &&
    latest.total != null &&
    latest.total > 0
  ) {
    percent = Math.min(100, Math.round((latest.current / latest.total) * 100));
  }

  const samples = history.filter(
    (e) =>
      e.phase === latest.phase &&
      e.step === latest.step &&
      e.current != null &&
      e.total != null &&
      e.total > 0 &&
      e.elapsed_ms != null,
  );
  const tail = samples.slice(-10);
  let ratePerSec: number | null = null;
  if (latest.avg_ms != null && latest.avg_ms > 0) {
    ratePerSec = 1000 / latest.avg_ms;
  } else if (tail.length >= 2) {
    const first = tail[0];
    const last = tail[tail.length - 1];
    const deltaCurrent = (last.current ?? 0) - (first.current ?? 0);
    const deltaMs = (last.elapsed_ms ?? 0) - (first.elapsed_ms ?? 0);
    if (deltaCurrent > 0 && deltaMs > 0) {
      ratePerSec = (deltaCurrent / deltaMs) * 1000;
    }
  }

  let remainingMs: number | null = null;
  if (
    latest.current != null &&
    latest.total != null &&
    latest.total > latest.current &&
    ratePerSec != null &&
    ratePerSec > 0
  ) {
    remainingMs = Math.round(((latest.total - latest.current) / ratePerSec) * 1000);
  }

  return { remainingMs, ratePerSec, elapsedMs, percent };
}

export function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

/** Split raw job log into display lines (collapse tqdm spam, tag phases, fold shutdown noise). */
export function parsePipelineLog(raw: string): PipelineLogLine[] {
  const cleaned = stripAnsi(raw);
  const physicalLines = cleaned.split('\n');
  const parsed: PipelineLogLine[] = [];
  let id = 0;

  for (const physical of physicalLines) {
    const segments = physical.split('\r');
    const line = (segments[segments.length - 1] ?? '').replace(/\s+$/, '');
    if (!line.trim()) continue;

    const trimmed = line.trim();
    const progressEvt = parseProgressPayload(trimmed);
    if (progressEvt) {
      parsed.push(progressEventToLogLine(progressEvt, id++));
      continue;
    }

    const kind = classifyLine(line);
    const entry: PipelineLogLine = { id: id++, text: line, kind, phase: 'other' };
    if (kind === 'progress') {
      entry.progress = parseTqdmProgress(line);
    }
    parsed.push(entry);
  }

  const collapsed = collapseConsecutiveProgress(parsed);
  return assignPhases(markNoiseRun(collapsed));
}

export function groupPipelineLogLines(lines: PipelineLogLine[]): PipelineLogGroup[] {
  const groups: PipelineLogGroup[] = [];
  let current: PipelineLogGroup | null = null;

  for (const line of lines) {
    const startsSection = line.kind === 'section';
    if (!current || (startsSection && current.lines.length > 0)) {
      if (current) groups.push(current);
      current = {
        phase: line.phase,
        label: PHASE_LABELS[line.phase],
        lines: [],
        done: false,
      };
      if (startsSection) {
        const m = line.text.match(/^\[([^\]]+)\]/);
        if (m) current.label = m[1];
      }
    }
    current.lines.push(line);
    if (line.kind === 'success' && /\bDone\.?\s*$/i.test(line.text)) {
      current.done = true;
    }
  }
  if (current) groups.push(current);
  return groups;
}

export function filterPipelineLogLines(
  lines: PipelineLogLine[],
  options: { query: string; hideNoise: boolean; errorsOnly: boolean },
): PipelineLogLine[] {
  const q = options.query.trim().toLowerCase();
  return lines.filter((line) => {
    if (options.hideNoise && line.kind === 'noise') return false;
    if (options.errorsOnly && line.kind !== 'error' && line.kind !== 'traceback') return false;
    if (!q) return true;
    return line.text.toLowerCase().includes(q);
  });
}

export function getPipelineLogStats(lines: PipelineLogLine[]) {
  const errors = lines.filter((l) => l.kind === 'error' || l.kind === 'traceback').length;
  const warnings = lines.filter((l) => l.kind === 'warning').length;
  const noise = lines.filter((l) => l.kind === 'noise').length;
  const lastProgress = [...lines].reverse().find((l) => l.kind === 'progress' && l.progress);
  return { errors, warnings, noise, lastProgress };
}

export const PIPELINE_LOG_LINE_CLASS: Record<PipelineLogLineKind, string> = {
  section: 'text-sky-300',
  progress: 'text-muted-foreground',
  activity: 'text-[#e6edf3]/90',
  info: 'text-violet-300',
  success: 'text-green-400',
  warning: 'text-amber-300',
  error: 'text-red-400 font-medium',
  traceback: 'text-red-300/90',
  noise: 'text-amber-200/70 italic',
  plain: 'text-[#e6edf3]/90',
};

export const PHASE_CHIP_CLASS: Record<PipelinePhase, string> = {
  config: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  crawl: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  lighthouse: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  report: 'border-green-500/40 bg-green-500/10 text-green-200',
  keywords: 'border-pink-500/40 bg-pink-500/10 text-pink-200',
  plot: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  optional: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  other: 'border-default bg-brand-800/60 text-muted-foreground',
};
