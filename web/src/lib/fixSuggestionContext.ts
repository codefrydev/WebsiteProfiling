import type { FixSuggestionRequest } from '@/types/fixSuggestion';
import type { ReportIssue, SecurityFinding, LighthouseDiagnostic, LighthouseQuickWin, LighthouseAuditRef, RichResultsValidationRow, ReportRedirect } from '@/types/report';
import type { QueryPageMisalignmentItem, CannibalisationItem } from '@/types/components';
import type { CompetitorKeywordGapRow } from '@/types/report';
import type { FlatBrowserErrorRow } from '@/lib/browserErrors';
import type { IssueDeltaRow } from '@/lib/reportCompareExtras';
import type { InspectorIssueRow } from '@/types/report';
import type { ContentDuplicateCluster } from '@/types/report';

export function buildIssueContext(issue: ReportIssue, category: string): FixSuggestionRequest {
  return {
    source: 'issue',
    message: issue.message || 'Audit issue',
    url: issue.url,
    context: {
      priority: issue.priority,
      category,
      recommendation: issue.recommendation,
      type: issue.type || issue.finding_type,
    },
  };
}

export function buildLighthouseQuickWinContext(win: LighthouseQuickWin, passed: boolean): FixSuggestionRequest {
  return {
    source: 'lighthouse',
    message: win.title || 'Lighthouse quick win',
    context: {
      kind: 'quick_win',
      why: win.why,
      how: win.how,
      impact: win.impact,
      passed,
    },
  };
}

export function buildLighthouseDiagnosticContext(d: LighthouseDiagnostic): FixSuggestionRequest {
  const evidence = Array.isArray(d.evidence) ? d.evidence.slice(0, 8) : [];
  const url = evidence.find((e) => typeof e === 'string' && (e.startsWith('http://') || e.startsWith('https://')));
  return {
    source: 'lighthouse',
    message: d.warning || d.helpText || d.one_line_fix || 'Lighthouse diagnostic',
    url: typeof url === 'string' ? url : undefined,
    context: {
      kind: 'diagnostic',
      severity: d.severity,
      one_line_fix: d.one_line_fix,
      detailed_fix: d.detailed_fix,
      estimated_impact: d.estimated_impact,
      lighthouse_audit_id: d.lighthouse_audit_id || d.id,
      evidence,
      primary_impact: d.primary_impact,
    },
  };
}

export function buildLighthouseAuditContext(audit: LighthouseAuditRef): FixSuggestionRequest {
  const items = audit?.details?.items;
  return {
    source: 'lighthouse',
    message: audit.title || audit.id || 'Lighthouse audit',
    context: {
      kind: 'audit',
      id: audit.id,
      description: audit.description,
      helpText: audit.helpText,
      displayValue: audit.displayValue,
      itemCount: Array.isArray(items) ? items.length : 0,
    },
  };
}

export function buildSecurityFindingContext(f: SecurityFinding): FixSuggestionRequest {
  return {
    source: 'security',
    message: f.message || f.finding_type || 'Security finding',
    url: f.url,
    context: {
      finding_type: f.finding_type,
      severity: f.severity,
      recommendation: f.recommendation,
    },
  };
}

export function buildSecurityHeaderContext(label: string, url?: string): FixSuggestionRequest {
  return {
    source: 'security',
    message: `Missing security header: ${label}`,
    url,
    context: { kind: 'missing_header', header: label },
  };
}

export function buildBrowserErrorContext(row: FlatBrowserErrorRow): FixSuggestionRequest {
  return {
    source: 'browser',
    message: row.message || 'Browser error',
    url: row.url,
    context: {
      kind: row.type,
      source_url: row.source_url,
      line: row.line,
      stack: row.stack ? row.stack.slice(0, 500) : undefined,
    },
  };
}

export function buildBrowserErrorSummaryContext(message: string, sampleUrls: string[], count: number): FixSuggestionRequest {
  return {
    source: 'browser',
    message,
    url: sampleUrls[0],
    context: {
      kind: 'recurring_console',
      count,
      sample_urls: sampleUrls.slice(0, 5),
    },
  };
}

export function buildInspectorIssueContext(issue: InspectorIssueRow, pageUrl?: string): FixSuggestionRequest {
  return {
    source: 'issue',
    message: issue.message || 'Page issue',
    url: pageUrl,
    context: {
      severity: issue.severity,
      type: issue.type,
      category: issue.category,
      recommendation: issue.recommendation,
      detail: issue.detail,
    },
  };
}

export function buildOnPageWarningContext(
  warning: { message?: string; severity?: string; detail?: string; id?: string },
  pageUrl: string,
): FixSuggestionRequest {
  return {
    source: 'browser',
    message: warning.message || 'On-page warning',
    url: pageUrl,
    context: {
      kind: 'on_page_warning',
      severity: warning.severity,
      detail: warning.detail,
      id: warning.id,
    },
  };
}

export function buildCompareIssueContext(row: IssueDeltaRow): FixSuggestionRequest {
  return {
    source: 'seo_content',
    message: row.message || 'Issue change',
    url: row.url,
    context: {
      kind: 'compare_issue',
      change: row.kind,
      priority: row.priority,
      category: row.category,
    },
  };
}

export function buildCompareSecurityContext(row: {
  message: string;
  url: string;
  findingType: string;
  severity: string;
  kind: string;
}): FixSuggestionRequest {
  return {
    source: 'security',
    message: row.message || row.findingType,
    url: row.url,
    context: {
      kind: 'compare_security',
      change: row.kind,
      finding_type: row.findingType,
      severity: row.severity,
    },
  };
}

export function buildMisalignmentContext(item: QueryPageMisalignmentItem): FixSuggestionRequest {
  return {
    source: 'seo_content',
    message: `Query/page misalignment: "${item.keyword}"`,
    url: item.current_url,
    context: {
      kind: 'misalignment',
      keyword: item.keyword,
      current_url: item.current_url,
      suggested_url: item.suggested_url,
      impressions: item.impressions,
      position: item.position,
    },
  };
}

export function buildCannibalisationContext(item: CannibalisationItem): FixSuggestionRequest {
  return {
    source: 'seo_content',
    message: `Keyword cannibalisation: "${item.query}"`,
    context: {
      kind: 'cannibalisation',
      query: item.query,
      pages: (item.pages || []).slice(0, 8).map((p) => ({
        url: p.url,
        position: p.position,
        clicks: p.clicks,
      })),
    },
  };
}

export function buildKeywordGapContext(row: CompetitorKeywordGapRow): FixSuggestionRequest {
  return {
    source: 'seo_content',
    message: row.keyword || 'Competitor keyword gap',
    url: row.url ?? undefined,
    context: {
      kind: 'keyword_gap',
      keyword: row.keyword,
      competitor: row.competitor,
      volume: row.volume,
      position: row.position,
      source: row.source,
    },
  };
}

export function buildRichResultsContext(row: RichResultsValidationRow): FixSuggestionRequest {
  return {
    source: 'seo_content',
    message: row.message || `Rich results ${row.status || 'issue'}`,
    url: row.url,
    context: {
      kind: 'rich_results',
      status: row.status,
      provenance: row.provenance,
    },
  };
}

export function buildDuplicateClusterContext(cluster: ContentDuplicateCluster): FixSuggestionRequest {
  const members = cluster.member_urls || [];
  return {
    source: 'seo_content',
    message: `Duplicate content cluster (${cluster.member_count ?? members.length} URLs)`,
    url: cluster.representative_url,
    context: {
      kind: 'duplicate_cluster',
      cluster_id: cluster.id,
      representative_url: cluster.representative_url,
      member_urls: members.slice(0, 10),
      member_count: cluster.member_count ?? members.length,
    },
  };
}

export function buildOverviewRecommendationContext(text: string): FixSuggestionRequest {
  return {
    source: 'seo_content',
    message: text,
    context: { kind: 'overview_recommendation' },
  };
}

export function buildRedirectContext(r: ReportRedirect): FixSuggestionRequest {
  const fromUrl = r.url || r.from;
  const toUrl = r.final_url || r.to;
  return {
    source: 'technical',
    message: `Redirect ${r.status ?? ''} from ${fromUrl || 'URL'}`,
    url: fromUrl,
    context: {
      kind: 'redirect',
      status: r.status,
      final_url: toUrl,
    },
  };
}

export function buildTechnicalLinkIssueContext(message: string, url: string, kind: string): FixSuggestionRequest {
  return {
    source: 'technical',
    message,
    url,
    context: { kind },
  };
}

export function buildRecommendationBulletContext(text: string, pageUrl?: string): FixSuggestionRequest {
  return {
    source: 'issue',
    message: text,
    url: pageUrl,
    context: { kind: 'inspector_recommendation' },
  };
}

export function buildContentSignalContext(
  signal: 'title' | 'meta' | 'h1',
  label: string,
  detail: string,
  statusLabel: string,
  pageUrl: string,
): FixSuggestionRequest {
  return {
    source: 'seo_content',
    message: `${label}: ${statusLabel}`,
    url: pageUrl,
    context: {
      kind: 'content_signal',
      signal,
      detail,
      status: statusLabel,
    },
  };
}

export function buildLighthouseFailureContext(helpText: string, id?: string, pageUrl?: string): FixSuggestionRequest {
  return {
    source: 'lighthouse',
    message: helpText || id || 'Lighthouse failure',
    url: pageUrl,
    context: { kind: 'top_failure', id: id || helpText },
  };
}
