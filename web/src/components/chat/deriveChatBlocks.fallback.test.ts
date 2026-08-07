import { describe, expect, it } from 'vitest';
import { deriveChatBlocks } from './deriveChatBlocks';
import type { ToolActivityItem } from './ChatToolActivity';

function doneTool(name: string, result: Record<string, unknown>): ToolActivityItem {
  return { id: name, name, status: 'done', result };
}

describe('deriveChatBlocks fallback layer', () => {
  it('builds generic_table for an unrecognized tool with row data', () => {
    const blocks = deriveChatBlocks([
      doneTool('list_keywords', {
        rows: [
          { keyword: 'seo audit tool', gsc_position: 4.2, clicks: 12 },
          { keyword: 'site profiling', gsc_position: 9.1, clicks: 3 },
        ],
        total: 2,
      }),
    ]);
    const table = blocks.find((b) => b.type === 'generic_table');
    expect(table).toBeDefined();
    if (table?.type === 'generic_table') {
      expect(table.toolName).toBe('list_keywords');
      expect(table.columns).toContain('keyword');
      expect(table.rows).toHaveLength(2);
      expect(table.total).toBe(2);
    }
  });

  it('builds generic_chart from a flat numeric object', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_geo_citability_summary', {
        avg_position: 12.3,
        pages_cited: 8,
        pages_missing_schema: 4,
      }),
    ]);
    const chart = blocks.find((b) => b.type === 'generic_chart');
    expect(chart).toBeDefined();
    if (chart?.type === 'generic_chart') {
      expect(chart.items).toHaveLength(3);
      expect(chart.vizType).toBe('pie');
    }
  });

  it('builds generic_chart from an array of two-field rows', () => {
    const blocks = deriveChatBlocks([
      doneTool('get_drift_breakdown', {
        items: [
          { label: 'Improved', value: 5 },
          { label: 'Regressed', value: 2 },
          { label: 'Unchanged', value: 20 },
        ],
      }),
    ]);
    // Also plausibly matches the named label_value_chart parser under a different
    // tool name; here the tool name isn't in CHART_TOOLS so only the fallback fires.
    const chart = blocks.find((b) => b.type === 'generic_chart');
    expect(chart).toBeDefined();
  });

  it('does not add a fallback block when a named parser already claimed the tool', () => {
    const blocks = deriveChatBlocks([
      doneTool('list_issues', {
        issues: [
          { priority: 'Critical', category: 'Mobile SEO', url: 'https://example.com', message: 'x' },
        ],
        total: 1,
      }),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(['issue_table']);
  });

  it('skips generic blocks when the tool result has an error', () => {
    const blocks = deriveChatBlocks([
      doneTool('list_keywords', { error: 'property_id is required', rows: [] }),
    ]);
    expect(blocks).toHaveLength(0);
  });
});
