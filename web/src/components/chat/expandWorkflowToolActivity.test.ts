import { describe, expect, it } from 'vitest';
import { expandWorkflowToolActivity } from '@/components/chat/expandWorkflowToolActivity';
import { deriveChatBlocks } from '@/components/chat/deriveChatBlocks';

describe('expandWorkflowToolActivity', () => {
  it('expands workflow steps for block derivation', () => {
    const activity = expandWorkflowToolActivity([
      {
        id: 'wf-1',
        name: 'run_insight_workflow',
        status: 'done',
        result: {
          workflow: 'insight',
          steps: [
            {
              tool: 'get_report_summary',
              result: {
                health_score: 72,
                site_name: 'Example',
                counts: { critical: 1, high: 2, medium: 3, low: 4 },
                total_issues: 10,
                total_urls: 100,
                success_rate: 0.98,
              },
            },
          ],
        },
      },
    ]);

    expect(activity.some((a) => a.name === 'get_report_summary')).toBe(true);
    const blocks = deriveChatBlocks(activity);
    expect(blocks.some((b) => b.type === 'issue_summary')).toBe(true);
  });
});
