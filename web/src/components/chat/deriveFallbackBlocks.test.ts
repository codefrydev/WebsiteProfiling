import { describe, expect, it } from 'vitest';
import { deriveFallbackBlocks } from './deriveFallbackBlocks';
import type { ToolActivityItem } from './ChatToolActivity';

function doneTool(name: string, result: Record<string, unknown>): ToolActivityItem {
  return { id: name, name, status: 'done', result };
}

describe('deriveFallbackBlocks', () => {
  it('creates error block for failed tools', () => {
    const blocks = deriveFallbackBlocks(
      [doneTool('get_google_summary', { error: 'GSC not connected' })],
      [],
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'tool_status',
      variant: 'error',
      toolName: 'get_google_summary',
    });
  });

  it('creates empty block when tool returns no rows and no viz', () => {
    const blocks = deriveFallbackBlocks(
      [doneTool('get_critical_issues', { issues: [], total: 0 })],
      [],
    );
    expect(blocks[0]).toMatchObject({ type: 'tool_status', variant: 'empty' });
  });

  it('creates truncated banner when result is truncated', () => {
    const blocks = deriveFallbackBlocks(
      [doneTool('list_issues', { items: [{ url: 'https://a.test' }], total: 50, shown: 10, truncated: true })],
      [],
    );
    expect(blocks.some((b) => b.type === 'tool_truncated')).toBe(true);
  });

  it('skips workflow parent tools', () => {
    const blocks = deriveFallbackBlocks(
      [doneTool('run_technical_workflow', { error: 'failed' })],
      [],
    );
    expect(blocks).toHaveLength(0);
  });
});
