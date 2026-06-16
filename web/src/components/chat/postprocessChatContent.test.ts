import { describe, expect, it } from 'vitest';
import { postprocessChatContent } from './postprocessChatContent';
import type { ToolActivityItem } from './ChatToolActivity';

function doneTool(name: string, result: Record<string, unknown>): ToolActivityItem {
  return { id: name, name, status: 'done', result };
}

describe('postprocessChatContent', () => {
  it('returns blocks and stripped prose for overview duplicate content', () => {
    const tools = [
      doneTool('get_report_summary', {
        health_score: 58,
        issue_counts: { Critical: 1, High: 2 },
        total_urls: 20,
        success_rate: 0.95,
        site_name: 'codefrydev.in',
      }),
    ];
    const content = `Here's the overview. health score is 58 / 100 with 20 URLs crawled.

### Power Insights
- Focus on the single critical blocker first.`;

    const out = postprocessChatContent(content, tools);
    expect(out.blocks.some((b) => b.type === 'issue_summary')).toBe(true);
    expect(out.prose).toContain('Power Insights');
    expect(out.prose.toLowerCase()).not.toContain('health score is 58');
  });

  it('marks prose hidden when strip removes all narrative', () => {
    const tools = [
      doneTool('get_report_summary', {
        health_score: 74,
        issue_counts: { High: 1 },
        total_urls: 10,
      }),
    ];
    const content = 'health score is 74 / 100 and 10 URLs crawled with 100% success rate.';
    const out = postprocessChatContent(content, tools);
    expect(out.proseHidden).toBe(true);
    expect(out.prose.trim()).toBe('');
  });

  it('flags partial error when agent error present with blocks', () => {
    const tools = [doneTool('list_issues', { issues: [{ priority: 'High', category: 'SEO', url: 'https://a.test', message: 'x' }] })];
    const out = postprocessChatContent('Partial summary.', tools, {
      agentError: 'Agent stopped after maximum tool rounds',
      partialError: true,
    });
    expect(out.hasPartialError).toBe(true);
    expect(out.failedTools).toHaveLength(0);
  });

  it('falls back to full preprocess when strip removes all prose', () => {
    const tools = [
      {
        id: '1',
        name: 'get_report_summary',
        status: 'done' as const,
        result: {
          health_score: 58,
          issue_counts: { Critical: 1 },
          total_urls: 10,
        },
      },
    ];
    const content = `| Core Web Vitals | Score 100 – great! |
| Security | Score 50 – review. |

### Recommended actions
- Add viewport meta tags on affected pages.`;

    const out = postprocessChatContent(content, tools);
    expect(out.prose).toContain('Recommended actions');
    expect(out.prose).toContain('viewport');
  });
});
