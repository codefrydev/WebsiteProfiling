export type PipelineLogLineKind =
  | 'section'
  | 'progress'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'traceback'
  | 'noise'
  | 'plain';

export type PipelinePhase = 'config' | 'crawl' | 'lighthouse' | 'report' | 'plot' | 'other';

export interface PipelineLogLine {
  id: number;
  text: string;
  kind: PipelineLogLineKind;
  phase: PipelinePhase;
  progress?: { percent: number; current: number; total: number };
}

export interface PipelineLogGroup {
  phase: PipelinePhase;
  label: string;
  lines: PipelineLogLine[];
  done: boolean;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

const PHASE_LABELS: Record<PipelinePhase, string> = {
  config: 'Settings',
  crawl: 'Crawl',
  lighthouse: 'Lighthouse',
  report: 'Site audit',
  plot: 'Charts',
  other: 'Output',
};

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
  plot: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  other: 'border-default bg-brand-800/60 text-muted-foreground',
};
