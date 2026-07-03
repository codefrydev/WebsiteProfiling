import { describe, expect, it } from 'vitest';
import { deriveChatBlocks } from './deriveChatBlocks';
import type { ToolActivityItem } from './ChatToolActivity';

function doneTool(name: string, result: Record<string, unknown>): ToolActivityItem {
  return { id: name, name, status: 'done', result };
}

describe('deriveChatBlocks artifact previews', () => {
  it('builds a file_download block for a binary export with no inline content', () => {
    const blocks = deriveChatBlocks([
      doneTool('export_audit_report', {
        artifact_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        format: 'pdf',
        filename: 'audit.pdf',
        mime_type: 'application/pdf',
        ready: true,
      }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('file_download');
  });

  it('builds a previewable code_artifact for an inlined HTML export', () => {
    const blocks = deriveChatBlocks([
      doneTool('export_audit_report', {
        artifact_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        format: 'html',
        filename: 'audit.html',
        mime_type: 'text/html',
        ready: true,
        content: '<html><body>Report</body></html>',
      }),
    ]);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block?.type).toBe('code_artifact');
    if (block?.type === 'code_artifact') {
      expect(block.previewable).toBe(true);
      expect(block.content).toContain('Report');
    }
  });

  it('builds a non-previewable code_artifact for an inlined CSV export', () => {
    const blocks = deriveChatBlocks([
      doneTool('export_list_as_csv', {
        artifact_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        format: 'csv',
        filename: 'issues.csv',
        mime_type: 'text/csv',
        ready: true,
        content: 'url,priority\nhttps://example.com,Critical\n',
      }),
    ]);
    const block = blocks[0];
    expect(block?.type).toBe('code_artifact');
    if (block?.type === 'code_artifact') {
      expect(block.previewable).toBe(false);
    }
  });
});
