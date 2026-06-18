import { categoryDisplayName } from '@/lib/categoryDisplayNames';
import {
  normalizePriority,
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  type PriorityKey,
} from '@/lib/issuePriority';
import { normReportUrl } from '@/lib/reportDiff';
import type { ReportIssue } from '@/types/report';

export const MAX_PROMPT_ISSUES = 80;
export const MAX_SAMPLE_URLS = 5;

export interface CategoryIssueInput {
  category: string;
  issue: ReportIssue;
}

export interface DedupedIssue {
  category: string;
  message: string;
  priority: PriorityKey;
  urlCount: number;
  sampleUrls: string[];
  recommendation?: string;
  impactScore?: number;
  gscClicks?: number;
}

export interface BuildIssuesPromptResult {
  rawCount: number;
  uniqueCount: number;
  includedCount: number;
  omittedCount: number;
  issues: DedupedIssue[];
  prompt: string;
  /** When set, used for the action-plan API instead of mapping from `issues`. */
  apiIssues?: ReturnType<typeof issuesForActionPlanApi>;
}

function issueKey(category: string, message: string): string {
  return `${category}|${message.slice(0, 120)}`;
}

function issueSortScore(issue: DedupedIssue): number {
  const impact = Number(issue.impactScore) || 0;
  const clicks = Number(issue.gscClicks) || 0;
  const priorityOrder = PRIORITY_CONFIG[issue.priority].order;
  return impact * 1_000_000 + clicks * 1_000 - priorityOrder * 10;
}

function pickBetterRow(current: DedupedIssue, candidate: DedupedIssue): DedupedIssue {
  const currentScore = issueSortScore(current);
  const candidateScore = issueSortScore(candidate);
  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return current;
  if (candidate.urlCount > current.urlCount) return candidate;
  return current;
}

function mergeUrl(current: DedupedIssue, url: string): DedupedIssue {
  const normalized = normReportUrl(url);
  if (!normalized) return current;
  if (current.sampleUrls.includes(normalized)) return current;
  return {
    ...current,
    urlCount: current.urlCount + 1,
    sampleUrls: [...current.sampleUrls, normalized].slice(0, MAX_SAMPLE_URLS),
  };
}

export function dedupeIssues(items: CategoryIssueInput[]): DedupedIssue[] {
  const map = new Map<string, DedupedIssue>();

  for (const item of items) {
    const category = item.category || '';
    const iss = item.issue;
    const message = String(iss.message || iss.recommendation || '').trim();
    if (!message) continue;

    const url = String(iss.url || '');
    const key = issueKey(category, message);
    const priority = normalizePriority(iss.priority);
    const row: DedupedIssue = {
      category,
      message,
      priority,
      urlCount: url ? 1 : 0,
      sampleUrls: url ? [normReportUrl(url)] : [],
      recommendation: iss.recommendation || iss.llm_recommendation || undefined,
      impactScore: iss.impact_score != null ? Number(iss.impact_score) : undefined,
      gscClicks: iss.gsc_clicks != null ? Number(iss.gsc_clicks) : undefined,
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }

    const merged = mergeUrl(pickBetterRow(existing, row), url);
    map.set(key, merged);
  }

  const sorted = [...map.values()].sort((a, b) => {
    const po = PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order;
    if (po !== 0) return po;
    const cat = categoryDisplayName(a.category).localeCompare(categoryDisplayName(b.category));
    if (cat !== 0) return cat;
    return issueSortScore(b) - issueSortScore(a);
  });

  return sorted;
}

function formatIssueBlock(issue: DedupedIssue): string {
  const lines: string[] = [`- ${issue.message}`];
  if (issue.urlCount > 1) {
    lines.push(`  - Affected URLs: ${issue.urlCount} pages`);
    if (issue.sampleUrls.length) {
      lines.push(`  - Sample URLs: ${issue.sampleUrls.join(', ')}`);
    }
  } else if (issue.sampleUrls[0]) {
    lines.push(`  - URL: ${issue.sampleUrls[0]}`);
  }
  if (issue.recommendation) {
    lines.push(`  - Rule fix: ${issue.recommendation}`);
  }
  if (issue.impactScore != null && issue.impactScore > 0) {
    lines.push(`  - Impact score: ${issue.impactScore.toLocaleString()}`);
  }
  if (issue.gscClicks != null && issue.gscClicks > 0) {
    lines.push(`  - GSC clicks: ${issue.gscClicks.toLocaleString()}`);
  }
  return lines.join('\n');
}

export function formatIssuesPrompt(options: {
  domain: string;
  issues: DedupedIssue[];
  rawCount: number;
  includedCount: number;
  omittedCount: number;
  generatedAt?: Date;
}): string {
  const { domain, issues, rawCount, includedCount, omittedCount } = options;
  const date = (options.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const uniqueCount = includedCount + omittedCount;

  const lines: string[] = [
    'You are an SEO and technical audit consultant. Review the following site audit issues and provide:',
    '1) Root causes grouped by category',
    '2) A prioritized fix plan (Critical → Low)',
    '3) Quick wins vs structural work',
    '4) Estimated effort per group',
    '',
    '## Site',
    `- Domain: ${domain}`,
    `- Report date: ${date}`,
    `- Unique issues: ${uniqueCount} (from ${rawCount} raw findings)`,
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
    const catLabel = categoryDisplayName(issue.category) || issue.category || 'Uncategorized';
    if (catLabel !== currentCategory) {
      currentCategory = catLabel;
      lines.push(`### ${catLabel}`, '');
    }
    lines.push(formatIssueBlock(issue), '');
  }

  if (omittedCount > 0) {
    lines.push(`… and ${omittedCount} more lower-priority issues omitted.`, '');
  }

  return lines.join('\n').trimEnd();
}

export function buildIssuesPrompt(
  domain: string,
  items: CategoryIssueInput[],
  generatedAt?: Date,
): BuildIssuesPromptResult {
  const rawCount = items.length;
  const deduped = dedupeIssues(items);
  const uniqueCount = deduped.length;

  const ranked = [...deduped].sort((a, b) => issueSortScore(b) - issueSortScore(a));
  const included = ranked.slice(0, MAX_PROMPT_ISSUES);
  const omittedCount = Math.max(0, uniqueCount - included.length);

  const issues = [...included].sort((a, b) => {
    const po = PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order;
    if (po !== 0) return po;
    const cat = categoryDisplayName(a.category).localeCompare(categoryDisplayName(b.category));
    if (cat !== 0) return cat;
    return issueSortScore(b) - issueSortScore(a);
  });

  const prompt = formatIssuesPrompt({
    domain,
    issues,
    rawCount,
    includedCount: issues.length,
    omittedCount,
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

export function formatActionPlanSection(planText: string): string {
  const trimmed = planText.trim();
  if (!trimmed) return '';
  return `\n\n---\n\n## AI action plan\n\n${trimmed}`;
}

export function issuesForActionPlanApi(issues: DedupedIssue[]): Array<{
  category: string;
  message: string;
  priority: string;
  url_count: number;
  sample_urls: string[];
  recommendation?: string;
  impact_score?: number;
  gsc_clicks?: number;
}> {
  return issues.map((issue) => ({
    category: issue.category,
    message: issue.message,
    priority: issue.priority,
    url_count: issue.urlCount,
    sample_urls: issue.sampleUrls,
    ...(issue.recommendation ? { recommendation: issue.recommendation } : {}),
    ...(issue.impactScore != null ? { impact_score: issue.impactScore } : {}),
    ...(issue.gscClicks != null ? { gsc_clicks: issue.gscClicks } : {}),
  }));
}

export { PRIORITY_ORDER };
