import { format, strings } from '@/lib/strings';

const c = strings.components.chat;

/** Human-readable labels for audit tool names in the activity UI. */
const TOOL_LABELS: Record<string, string> = {
  run_insight_workflow: 'Insight workflow',
  run_technical_workflow: 'Technical audit workflow',
  run_keyword_workflow: 'Keyword workflow',
  run_domain_agent: 'Domain exploration',
  search_audit_tools: 'Searching tools',
  get_report_summary: 'Report summary',
  list_issues: 'Issue list',
  get_critical_issues: 'Critical issues',
  get_opportunity_matrix: 'Opportunity matrix',
  get_traffic_health_check: 'Traffic health',
  get_landing_page_blended_table: 'Landing page metrics',
};

export function formatToolDisplayName(name: string): string {
  const key = name.trim();
  if (!key) return 'audit tool';
  if (TOOL_LABELS[key]) return TOOL_LABELS[key];
  return key.replace(/_/g, ' ');
}

export function statusFromSseEvent(evt: {
  type: string;
  phase?: string;
  detail?: string;
  name?: string;
}): string {
  if (evt.type === 'tool_start' && evt.name) {
    return format(c.toolStatus, { name: formatToolDisplayName(evt.name) });
  }
  if (evt.type === 'tool_progress' && evt.detail) {
    return evt.detail;
  }
  if (evt.type === 'status') {
    const phase = evt.phase || '';
    const detail = evt.detail || '';
    if (phase === 'synthesizing') {
      return detail.toLowerCase().includes('retry')
        ? c.synthesizingRetry
        : c.synthesizing;
    }
    if (phase === 'model' && detail) {
      const stepMatch = /step (\d+) of (\d+)/i.exec(detail);
      if (stepMatch) {
        return format(c.thinkingStep, {
          step: stepMatch[1],
          total: stepMatch[2],
        });
      }
      return detail;
    }
    return detail || c.thinking;
  }
  if (evt.type === 'token') {
    return c.writingSummary;
  }
  return c.thinking;
}
