import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';
import {
  blockKey,
  deriveChatBlocks,
  type ChatBlock,
} from '@/components/chat/deriveChatBlocks';

const WORKFLOW_TOOLS = new Set([
  'run_insight_workflow',
  'run_technical_workflow',
  'run_keyword_workflow',
  'run_domain_agent',
]);

const GSC_TOOLS = new Set([
  'get_google_summary',
  'get_gsc_top_queries',
  'get_gsc_top_pages',
  'compare_google_metrics',
]);

const LIGHTHOUSE_TOOLS = new Set(['get_lighthouse_summary', 'list_lighthouse_image_opportunities']);

const ISSUE_LIST_TOOLS = new Set([
  'list_issues',
  'get_critical_issues',
  'list_issues_by_category',
  'get_category_issues',
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toolProducedVizBlock(toolName: string, vizBlocks: ChatBlock[]): boolean {
  for (const block of vizBlocks) {
    if (block.type === 'tool_status' || block.type === 'tool_truncated') continue;
    if (toolName === 'get_report_summary' && block.type === 'issue_summary') return true;
    if (ISSUE_LIST_TOOLS.has(toolName) && block.type === 'issue_table') return true;
    if (GSC_TOOLS.has(toolName) && block.type === 'google_summary') return true;
    if (LIGHTHOUSE_TOOLS.has(toolName) && block.type === 'lighthouse_scores') return true;
    if (toolName === 'get_image_audit_summary' && block.type === 'image_audit_summary') return true;
    if (toolName.startsWith('list_pages_') && block.type === 'image_pages_table') return true;
    if (toolName.startsWith('export_') && block.type === 'file_download') return true;
    if (toolName === 'get_category_scores' && block.type === 'category_scores') return true;
    if (toolName === 'get_issue_priority_breakdown' && block.type === 'label_value_chart') return true;
    if (toolName === 'get_status_code_breakdown' && block.type === 'status_breakdown') return true;
    if (toolName === 'get_health_history' && block.type === 'health_trend') return true;
    if (toolName === 'compare_category_deltas' && block.type === 'compare_category_deltas') return true;
  }
  return false;
}

function hintForError(toolName: string, message: string): string | undefined {
  const msg = message.toLowerCase();
  if (msg.includes('no report') || msg.includes('report not found')) {
    return 'Run an audit for this property first.';
  }
  if (msg.includes('gsc') || msg.includes('google') || GSC_TOOLS.has(toolName)) {
    return 'Connect Google Search Console in Settings.';
  }
  if (msg.includes('lighthouse') || LIGHTHOUSE_TOOLS.has(toolName)) {
    return 'Enable Lighthouse in pipeline settings and re-run the audit.';
  }
  if (msg.includes('property')) {
    return 'Select a property with crawl data.';
  }
  return undefined;
}

function isEmptyResult(result: Record<string, unknown>): boolean {
  if (Array.isArray(result.items) && result.items.length === 0) return true;
  if (Array.isArray(result.issues) && result.issues.length === 0) return true;
  if (Array.isArray(result.pages) && result.pages.length === 0) return true;
  if (Array.isArray(result.queries) && result.queries.length === 0) return true;
  if (result.total === 0) return true;
  if (result.count === 0) return true;
  return false;
}

function emptyMessageForTool(toolName: string): string {
  if (ISSUE_LIST_TOOLS.has(toolName)) return 'No matching issues found.';
  if (GSC_TOOLS.has(toolName)) return 'No Search Console data available for this period.';
  if (LIGHTHOUSE_TOOLS.has(toolName)) return 'No Lighthouse results for this report.';
  if (toolName === 'get_image_audit_summary') return 'No image audit data in this report.';
  return 'No data returned for this query.';
}

export function deriveFallbackBlocks(
  toolActivity: ToolActivityItem[],
  vizBlocks: ChatBlock[],
): ChatBlock[] {
  const fallbacks: ChatBlock[] = [];
  const seen = new Set<string>();

  for (const item of toolActivity) {
    if (item.status !== 'done' || !item.result) continue;
    if (WORKFLOW_TOOLS.has(item.name)) continue;

    const result = asRecord(item.result);
    if (!result) continue;

    if (result.error) {
      const message = String(result.error);
      const block: ChatBlock = {
        type: 'tool_status',
        variant: 'error',
        toolName: item.name,
        message,
        hint: hintForError(item.name, message),
      };
      const key = blockKey(block);
      if (!seen.has(key)) {
        seen.add(key);
        fallbacks.push(block);
      }
      continue;
    }

    if (result.missing) {
      const block: ChatBlock = {
        type: 'tool_status',
        variant: 'missing_data',
        toolName: item.name,
        message: String(result.message || result.missing || 'Data not available'),
        hint: hintForError(item.name, String(result.message || result.missing || '')),
      };
      const key = blockKey(block);
      if (!seen.has(key)) {
        seen.add(key);
        fallbacks.push(block);
      }
      continue;
    }

    if (result.truncated === true) {
      const shown = Number(result.shown ?? result.limit ?? 0);
      const total = Number(result.total ?? shown);
      if (total > shown && shown > 0) {
        const block: ChatBlock = {
          type: 'tool_truncated',
          toolName: item.name,
          shown,
          total,
        };
        const key = blockKey(block);
        if (!seen.has(key)) {
          seen.add(key);
          fallbacks.push(block);
        }
      }
    }

    if (!toolProducedVizBlock(item.name, vizBlocks) && isEmptyResult(result)) {
      const block: ChatBlock = {
        type: 'tool_status',
        variant: 'empty',
        toolName: item.name,
        message: emptyMessageForTool(item.name),
      };
      const key = blockKey(block);
      if (!seen.has(key)) {
        seen.add(key);
        fallbacks.push(block);
      }
    }
  }

  return fallbacks;
}

export function mergeChatBlocks(vizBlocks: ChatBlock[], fallbackBlocks: ChatBlock[]): ChatBlock[] {
  const merged: ChatBlock[] = [];
  const seen = new Set<string>();
  for (const block of [...vizBlocks, ...fallbackBlocks]) {
    const key = blockKey(block);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(block);
  }
  return merged;
}

export { deriveChatBlocks };
