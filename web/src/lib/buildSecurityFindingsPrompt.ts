import { securityFindingLabel } from '@/lib/securityFindingLabels';
import {
  type PriorityKey,
} from '@/lib/issuePriority';
import { normReportUrl } from '@/lib/reportDiff';
import type { SecurityFinding } from '@/types/report';
import {
  formatActionPlanSection,
  issuesForActionPlanApi,
  MAX_PROMPT_ISSUES,
  MAX_SAMPLE_URLS,
  type BuildIssuesPromptResult,
  type DedupedIssue,
} from '@/lib/buildIssuesPrompt';

export type SecuritySeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const SEVERITY_ORDER: SecuritySeverity[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];

const SEVERITY_RANK: Record<SecuritySeverity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4,
};

export interface DedupedSecurityFinding extends DedupedIssue {
  severity: SecuritySeverity;
  findingType?: string;
}

function normalizeSeverity(raw?: string | null): SecuritySeverity {
  const cap = raw ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : 'Info';
  if (cap === 'Critical' || cap === 'High' || cap === 'Medium' || cap === 'Low' || cap === 'Info') {
    return cap;
  }
  return 'Info';
}

function severityToPriority(severity: SecuritySeverity): PriorityKey {
  if (severity === 'Info') return 'Low';
  return severity;
}

function findingKey(findingType: string, message: string): string {
  return `${findingType}|${message.slice(0, 120)}`;
}

function findingSortScore(issue: DedupedSecurityFinding): number {
  return issue.urlCount * 1_000 - SEVERITY_RANK[issue.severity] * 10;
}

function pickHigherSeverity(current: DedupedSecurityFinding, candidate: DedupedSecurityFinding): DedupedSecurityFinding {
  const currentRank = SEVERITY_RANK[current.severity];
  const candidateRank = SEVERITY_RANK[candidate.severity];
  if (candidateRank < currentRank) return candidate;
  if (candidateRank > currentRank) return current;
  return candidate.urlCount >= current.urlCount ? candidate : current;
}

function mergeUrl(current: DedupedSecurityFinding, url: string): DedupedSecurityFinding {
  const normalized = normReportUrl(url);
  if (!normalized) return current;
  if (current.sampleUrls.includes(normalized)) {
    return { ...current, urlCount: current.urlCount + 1 };
  }
  return {
    ...current,
    urlCount: current.urlCount + 1,
    sampleUrls: [...current.sampleUrls, normalized].slice(0, MAX_SAMPLE_URLS),
  };
}

export function dedupeSecurityFindings(findings: SecurityFinding[]): DedupedSecurityFinding[] {
  const map = new Map<string, DedupedSecurityFinding>();

  for (const f of findings) {
    const findingType = String(f.finding_type || '').trim();
    const typeLabel = securityFindingLabel(findingType) || findingType || 'Security finding';
    const message = String(f.message || typeLabel).trim();
    if (!message) continue;

    const severity = normalizeSeverity(f.severity);
    const url = normReportUrl(f.url);
    const key = findingKey(findingType || typeLabel, message);

    const candidate: DedupedSecurityFinding = {
      category: typeLabel,
      message,
      priority: severityToPriority(severity),
      severity,
      findingType: findingType || undefined,
      urlCount: url ? 1 : 0,
      sampleUrls: url ? [url] : [],
      recommendation: f.recommendation || undefined,
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, candidate);
      continue;
    }

    const better = pickHigherSeverity(existing, candidate);
    map.set(key, mergeUrl(better, String(f.url || '')));
  }

  return [...map.values()].sort((a, b) => {
    const so = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (so !== 0) return so;
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) return cat;
    return findingSortScore(b) - findingSortScore(a);
  });
}

function formatFindingBlock(issue: DedupedSecurityFinding): string {
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
    lines.push(`  - Recommendation: ${issue.recommendation}`);
  }
  return lines.join('\n');
}

export function formatSecurityFindingsPrompt(options: {
  domain: string;
  issues: DedupedSecurityFinding[];
  rawCount: number;
  includedCount: number;
  omittedCount: number;
  generatedAt?: Date;
}): string {
  const { domain, issues, rawCount, includedCount, omittedCount } = options;
  const date = (options.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const uniqueCount = includedCount + omittedCount;

  const lines: string[] = [
    'You are a web security and HTTP headers consultant. Review the following security audit findings and provide:',
    '1) Root causes grouped by finding type',
    '2) A prioritized remediation plan (Critical → Info)',
    '3) Quick wins vs infrastructure changes',
    '4) Estimated effort per group',
    '',
    '## Site',
    `- Domain: ${domain}`,
    `- Report date: ${date}`,
    `- Unique findings: ${uniqueCount} (from ${rawCount} raw scan results)`,
    '',
  ];

  let currentSeverity: SecuritySeverity | null = null;
  let currentCategory: string | null = null;

  for (const issue of issues) {
    if (issue.severity !== currentSeverity) {
      currentSeverity = issue.severity;
      currentCategory = null;
      lines.push(`## ${currentSeverity}`, '');
    }
    if (issue.category !== currentCategory) {
      currentCategory = issue.category;
      lines.push(`### ${issue.category}`, '');
    }
    lines.push(formatFindingBlock(issue), '');
  }

  if (omittedCount > 0) {
    lines.push(`… and ${omittedCount} more lower-priority findings omitted.`, '');
  }

  return lines.join('\n').trimEnd();
}

export function buildSecurityFindingsPrompt(
  domain: string,
  findings: SecurityFinding[],
  generatedAt?: Date,
): BuildIssuesPromptResult {
  const rawCount = findings.length;
  const deduped = dedupeSecurityFindings(findings);
  const uniqueCount = deduped.length;

  const ranked = [...deduped].sort((a, b) => findingSortScore(b) - findingSortScore(a));
  const included = ranked.slice(0, MAX_PROMPT_ISSUES);
  const omittedCount = Math.max(0, uniqueCount - included.length);

  const issues = [...included].sort((a, b) => {
    const so = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (so !== 0) return so;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return findingSortScore(b) - findingSortScore(a);
  });

  const prompt = formatSecurityFindingsPrompt({
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
    issues: issues.map((issue) => ({
      category: issue.category,
      message: issue.message,
      priority: severityToPriority(issue.severity),
      urlCount: issue.urlCount,
      sampleUrls: issue.sampleUrls,
      recommendation: issue.recommendation,
    })),
    apiIssues: issues.map((issue) => ({
      category: issue.category,
      message: issue.message,
      priority: issue.severity,
      url_count: issue.urlCount,
      sample_urls: issue.sampleUrls,
      ...(issue.recommendation ? { recommendation: issue.recommendation } : {}),
    })),
    prompt,
  };
}

export { formatActionPlanSection, issuesForActionPlanApi, SEVERITY_ORDER };
