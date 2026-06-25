import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';

const WORKFLOW_TOOLS = new Set([
  'run_insight_workflow',
  'run_technical_workflow',
  'run_keyword_workflow',
  'run_domain_agent',
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Expand workflow parent tools into their child step results for chart/block renderers. */
export function expandWorkflowToolActivity(items: ToolActivityItem[]): ToolActivityItem[] {
  const out: ToolActivityItem[] = [];

  for (const item of items) {
    if (item.status !== 'done' || !item.result || !WORKFLOW_TOOLS.has(item.name)) {
      out.push(item);
      continue;
    }

    const steps = item.result.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      out.push(item);
      continue;
    }

    for (let i = 0; i < steps.length; i++) {
      const step = asRecord(steps[i]);
      if (!step) continue;
      const stepTool = String(step.tool || step.name || `step_${i + 1}`);
      const stepResult = asRecord(step.result);
      if (!stepResult) continue;
      out.push({
        id: `${item.id}-step-${i}`,
        name: stepTool,
        args: item.args,
        result: stepResult,
        status: 'done',
      });
    }
  }

  return out.length ? out : items;
}
