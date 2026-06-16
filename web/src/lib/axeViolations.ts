import type { PageAnalysis, ReportLink, ReportPayload } from '@/types/report';

export interface AxeViolation {
  id?: string;
  impact?: string;
  description?: string;
  help?: string;
  nodes?: number;
}

export interface FlatAxePageRow {
  id: string;
  url: string;
  title: string;
  violationCount: number;
  violations: AxeViolation[];
}

export interface AxeRuleSummary {
  ruleId: string;
  count: number;
}

function parseAxeViolations(link: ReportLink): AxeViolation[] {
  const pa = link.page_analysis;
  if (!pa || typeof pa !== 'object') return [];
  const raw = (pa as PageAnalysis).axe_violations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is AxeViolation => v != null && typeof v === 'object');
}

export function linkHasAxeViolations(link: ReportLink): boolean {
  return parseAxeViolations(link).length > 0;
}

export function flattenAxePages(links: ReportLink[] | undefined): FlatAxePageRow[] {
  const rows: FlatAxePageRow[] = [];
  for (const link of links || []) {
    const violations = parseAxeViolations(link);
    if (!violations.length || !link.url) continue;
    rows.push({
      id: link.url,
      url: link.url,
      title: String(link.title || ''),
      violationCount: violations.length,
      violations,
    });
  }
  rows.sort((a, b) => b.violationCount - a.violationCount || a.url.localeCompare(b.url));
  return rows;
}

export function aggregateAxeRules(rows: FlatAxePageRow[]): AxeRuleSummary[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const v of row.violations) {
      const rule = String(v.id || v.description || 'unknown');
      counts.set(rule, (counts.get(rule) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count);
}

export function getAxeScopeInfo(data: ReportPayload | null | undefined): {
  renderMode: string;
  usesBrowser: boolean;
} {
  const scope = (data?.report_meta as { crawl_scope?: Record<string, unknown> } | undefined)?.crawl_scope;
  const renderMode = String(scope?.render_mode ?? 'static');
  const usesBrowser = renderMode === 'javascript' || renderMode === 'auto' || renderMode === 'js';
  return { renderMode, usesBrowser };
}
