import { describe, expect, it } from 'vitest';
import { blockKey, deriveChatBlocks, toolEventsToActivity } from './deriveChatBlocks';
import type { ToolActivityItem } from './ChatToolActivity';

function doneTool(name: string, result: Record<string, unknown>): ToolActivityItem {
  return { id: name, name, status: 'done', result };
}

describe('deriveChatBlocks', () => {
  it('builds issue_summary from get_report_summary', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_report_summary', {
        health_score: 74,
        issue_counts: { Critical: 1, High: 29, Medium: 14, Low: 2 },
        total_issues: 46,
        site_name: 'codefrydev.in',
        crawl_summary: {
          total_urls: 30,
          count_2xx: 30,
          success_rate: 1,
        },
      }),
    ]);
    expect(blocks.map((b) => b.type)).toContain('issue_summary');
    expect(blocks.map((b) => b.type)).toContain('status_breakdown');
    const summary = blocks.find((b) => b.type === 'issue_summary');
    if (summary?.type === 'issue_summary') {
      expect(summary.healthScore).toBe(74);
      expect(summary.counts.Critical).toBe(1);
      expect(summary.totalUrls).toBe(30);
      expect(summary.successRate).toBe(1);
    }
  });

  it('builds category_scores from get_report_summary categories', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_report_summary', {
        health_score: 80,
        issue_counts: { High: 2 },
        categories: [{ name: 'Crawl', score: 0, issue_count: 5 }],
      }),
    ]);
    expect(blocks.map((b) => b.type)).toContain('issue_summary');
    expect(blocks.map((b) => b.type)).toContain('category_scores');
  });

  it('builds issue_table from list_issues', () => {
    const blocks = deriveChatBlocks([
      doneTool('list_issues', {
        issues: [
          {
            priority: 'Critical',
            category: 'Mobile SEO',
            url: 'https://example.com',
            message: 'Missing viewport',
          },
        ],
        total: 1,
        truncated: false,
      }),
    ]);
    expect(blocks[0]?.type).toBe('issue_table');
  });

  it('builds category_scores from get_category_scores', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_category_scores', {
        health_score: 80,
        categories: [{ name: 'Technical SEO', score: 85, issue_count: 3 }],
      }),
    ]);
    expect(blocks[0]?.type).toBe('category_scores');
  });

  it('builds multiple label_value_chart blocks', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_mime_type_breakdown', {
        items: [
          { label: 'text/html', value: 120 },
          { label: 'image/png', value: 40 },
        ],
      }),
      doneTool('get_title_length_distribution', {
        items: [{ label: '0-30', value: 10 }],
      }),
    ]);
    const charts = blocks.filter((b) => b.type === 'label_value_chart');
    expect(charts).toHaveLength(2);
  });

  it('builds status_breakdown from get_status_code_breakdown', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_status_code_breakdown', {
        status_counts: { '2xx': 100, '4xx': 5 },
        summary: { success_rate: 95.2, total_urls: 105 },
      }),
    ]);
    expect(blocks[0]?.type).toBe('status_breakdown');
  });

  it('builds health_trend from get_health_history', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_health_history', {
        snapshots: [
          { health_score: 70, generated_at: '2026-01-01T00:00:00' },
          { health_score: 75, generated_at: '2026-02-01T00:00:00' },
        ],
      }),
    ]);
    expect(blocks[0]?.type).toBe('health_trend');
  });

  it('builds priority chart from get_report_summary counts', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_report_summary', {
        health_score: 70,
        issue_counts: { Critical: 2, High: 5 },
      }),
    ]);
    const chart = blocks.find((b) => b.type === 'label_value_chart');
    expect(chart).toBeDefined();
    if (chart?.type === 'label_value_chart') {
      expect(chart.title).toBe('Issues by priority');
    }
  });

  it('builds issue_table from get_critical_issues', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_critical_issues', {
        issues: [
          {
            priority: 'Critical',
            category: 'Mobile SEO',
            url: 'https://example.com/page',
            message: 'Missing viewport',
          },
        ],
        total: 1,
      }),
    ]);
    expect(blocks[0]?.type).toBe('issue_table');
  });

  it('builds compare_category_deltas block', () => {
    const blocks = deriveChatBlocks([
      doneTool('compare_category_deltas', {
        category_scores: [
          { id: 'crawl', name: 'Crawl', current: 50, baseline: 80, delta: -30 },
        ],
      }),
    ]);
    expect(blocks[0]?.type).toBe('compare_category_deltas');
  });

  it('dedupes block types across multiple tools', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_report_summary', {
        health_score: 70,
        issue_counts: { High: 2 },
      }),
      doneTool('list_issues', {
        issues: [{ priority: 'High', category: 'SEO', url: '', message: 'x' }],
      }),
    ]);
    expect(blocks.map((b) => b.type)).toEqual([
      'issue_summary',
      'label_value_chart',
      'issue_table',
    ]);
  });

  it('ignores tools without results or with errors', () => {
    expect(deriveChatBlocks([{ id: '1', name: 'list_issues', status: 'running' }])).toEqual([]);
    expect(deriveChatBlocks([doneTool('list_issues', { error: 'no report' })])).toEqual([]);
  });

  it('blockKey distinguishes label_value charts by title', () => {
    expect(blockKey({ type: 'label_value_chart', title: 'MIME types', items: [] })).toBe(
      'label_value:MIME types',
    );
  });
});

describe('toolEventsToActivity', () => {
  it('restores persisted tool_events', () => {
    const activity = toolEventsToActivity({
      tool_events: [
        {
          name: 'list_issues',
          args: { limit: 5 },
          result: { total: 0, issues: [] },
        },
      ],
    });
    expect(activity).toHaveLength(1);
    expect(activity[0]?.name).toBe('list_issues');
    expect(activity[0]?.status).toBe('done');
  });
});
