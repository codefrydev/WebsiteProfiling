import {
  PRIORITY_CONFIG,
  type PriorityKey,
} from '@/lib/issuePriority';
import { normReportUrl } from '@/lib/reportDiff';
import type { FlatBrowserErrorRow } from '@/lib/browserErrors';
import {
  formatActionPlanSection,
  issuesForActionPlanApi,
  MAX_PROMPT_ISSUES,
  MAX_SAMPLE_URLS,
  type BuildIssuesPromptResult,
  type DedupedIssue,
} from '@/lib/buildIssuesPrompt';

const TYPE_LABELS: Record<FlatBrowserErrorRow['type'], string> = {
  console: 'Console error',
  exception: 'Uncaught exception',
};

const TYPE_PRIORITY: Record<FlatBrowserErrorRow['type'], PriorityKey> = {
  exception: 'High',
  console: 'Medium',
};

export interface DedupedBrowserError extends DedupedIssue {
  errorType: FlatBrowserErrorRow['type'];
  sourceHint?: string;
}

function errorKey(type: FlatBrowserErrorRow['type'], message: string): string {
  return `${type}|${message.slice(0, 120)}`;
}

function formatSource(row: FlatBrowserErrorRow): string | undefined {
  if (!row.source_url) return undefined;
  return row.line != null ? `${row.source_url}:${row.line}` : row.source_url;
}

function browserErrorSortScore(issue: DedupedBrowserError): number {
  const priorityOrder = PRIORITY_CONFIG[issue.priority].order;
  return issue.urlCount * 1_000 - priorityOrder * 10;
}

function mergeBrowserRow(
  current: DedupedBrowserError,
  row: FlatBrowserErrorRow,
): DedupedBrowserError {
  const url = normReportUrl(row.url);
  let next = current;
  if (url && !current.sampleUrls.includes(url)) {
    next = {
      ...current,
      urlCount: current.urlCount + 1,
      sampleUrls: [...current.sampleUrls, url].slice(0, MAX_SAMPLE_URLS),
    };
  } else if (url) {
    next = { ...current, urlCount: current.urlCount + 1 };
  }
  if (!next.sourceHint) {
    next = { ...next, sourceHint: formatSource(row) };
  }
  return next;
}

export function dedupeBrowserErrors(rows: FlatBrowserErrorRow[]): DedupedBrowserError[] {
  const map = new Map<string, DedupedBrowserError>();

  for (const row of rows) {
    const message = String(row.message || '').trim();
    if (!message || message === '—') continue;

    const key = errorKey(row.type, message);
    const url = normReportUrl(row.url);
    const category = TYPE_LABELS[row.type];
    const priority = TYPE_PRIORITY[row.type];
    const stackHint =
      row.type === 'exception' && row.stack
        ? `Stack trace available (first ${Math.min(row.stack.length, 200)} chars): ${row.stack.slice(0, 200)}`
        : undefined;
    const sourceHint = formatSource(row);

    const candidate: DedupedBrowserError = {
      category,
      message,
      priority,
      errorType: row.type,
      urlCount: url ? 1 : 0,
      sampleUrls: url ? [url] : [],
      sourceHint,
      recommendation: stackHint,
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, candidate);
      continue;
    }
    map.set(key, mergeBrowserRow(existing, row));
  }

  return [...map.values()].sort((a, b) => {
    const po = PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order;
    if (po !== 0) return po;
    const typeOrder = a.errorType === 'exception' ? -1 : 1;
    const typeOrderB = b.errorType === 'exception' ? -1 : 1;
    if (typeOrder !== typeOrderB) return typeOrder - typeOrderB;
    return browserErrorSortScore(b) - browserErrorSortScore(a);
  });
}

function formatBrowserErrorBlock(issue: DedupedBrowserError): string {
  const lines: string[] = [`- ${issue.message}`];
  if (issue.urlCount > 1) {
    lines.push(`  - Affected URLs: ${issue.urlCount} pages`);
    if (issue.sampleUrls.length) {
      lines.push(`  - Sample URLs: ${issue.sampleUrls.join(', ')}`);
    }
  } else if (issue.sampleUrls[0]) {
    lines.push(`  - URL: ${issue.sampleUrls[0]}`);
  }
  if (issue.sourceHint) {
    lines.push(`  - Source: ${issue.sourceHint}`);
  }
  if (issue.recommendation) {
    lines.push(`  - Detail: ${issue.recommendation}`);
  }
  return lines.join('\n');
}

export function formatBrowserErrorsPrompt(options: {
  domain: string;
  issues: DedupedBrowserError[];
  rawCount: number;
  includedCount: number;
  omittedCount: number;
  renderMode?: string;
  generatedAt?: Date;
}): string {
  const { domain, issues, rawCount, includedCount, omittedCount, renderMode } = options;
  const date = (options.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const uniqueCount = includedCount + omittedCount;

  const lines: string[] = [
    'You are a frontend debugging specialist. Review the following JavaScript console errors and uncaught exceptions from a site crawl and provide:',
    '1) Root causes grouped by error type and message pattern',
    '2) A prioritized fix plan (exceptions first, then recurring console errors)',
    '3) Quick wins vs deeper refactors',
    '4) Estimated effort per group',
    '',
    '## Site',
    `- Domain: ${domain}`,
    `- Report date: ${date}`,
    `- Render mode: ${renderMode || 'javascript'}`,
    `- Unique error patterns: ${uniqueCount} (from ${rawCount} raw log entries)`,
    '',
  ];

  let currentPriority: PriorityKey | null = null;
  let currentCategory: string | null = null;

  for (const issue of issues) {
    if (issue.priority !== currentPriority) {
      currentPriority = issue.priority;
      currentCategory = null;
      lines.push(`## ${currentPriority}`, '');
    }
    if (issue.category !== currentCategory) {
      currentCategory = issue.category;
      lines.push(`### ${issue.category}`, '');
    }
    lines.push(formatBrowserErrorBlock(issue), '');
  }

  if (omittedCount > 0) {
    lines.push(`… and ${omittedCount} more lower-priority error patterns omitted.`, '');
  }

  return lines.join('\n').trimEnd();
}

export function buildBrowserErrorsPrompt(
  domain: string,
  rows: FlatBrowserErrorRow[],
  renderMode?: string,
  generatedAt?: Date,
): BuildIssuesPromptResult {
  const rawCount = rows.length;
  const deduped = dedupeBrowserErrors(rows);
  const uniqueCount = deduped.length;

  const ranked = [...deduped].sort((a, b) => browserErrorSortScore(b) - browserErrorSortScore(a));
  const included = ranked.slice(0, MAX_PROMPT_ISSUES);
  const omittedCount = Math.max(0, uniqueCount - included.length);

  const issues = [...included].sort((a, b) => {
    const po = PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order;
    if (po !== 0) return po;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return browserErrorSortScore(b) - browserErrorSortScore(a);
  });

  const prompt = formatBrowserErrorsPrompt({
    domain,
    issues,
    rawCount,
    includedCount: issues.length,
    omittedCount,
    renderMode,
    generatedAt,
  });

  return {
    rawCount,
    uniqueCount,
    includedCount: issues.length,
    omittedCount,
    issues,
    prompt,
  };
}

export { formatActionPlanSection, issuesForActionPlanApi };
