import { describe, expect, it } from 'vitest';
import { deriveChatBlocks } from '@/components/chat/deriveChatBlocks';
import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';

describe('deriveChatBlocks prepare_audit_run', () => {
  it('builds audit_run_confirm block when ready', () => {
    const activity: ToolActivityItem[] = [
      {
        id: 'prepare-0',
        name: 'prepare_audit_run',
        status: 'done',
        result: {
          ready: true,
          summary: {
            start_url: 'https://example.com',
            crawl_preset: 'starter',
            pipeline_mode: 'full-audit',
            highlights: ['Up to 500 pages'],
          },
          run_spec: {
            command: '',
            state: { start_url: 'https://example.com', run_crawl: 'true' },
            create_property: null,
          },
        },
      },
    ];
    const blocks = deriveChatBlocks(activity);
    expect(blocks.some((b) => b.type === 'audit_run_confirm')).toBe(true);
    const block = blocks.find((b) => b.type === 'audit_run_confirm');
    expect(block && block.type === 'audit_run_confirm' && block.startUrl).toBe('https://example.com');
  });

  it('skips block when not ready', () => {
    const activity: ToolActivityItem[] = [
      {
        id: 'prepare-0',
        name: 'prepare_audit_run',
        status: 'done',
        result: { ready: false, errors: ['missing url'] },
      },
    ];
    const blocks = deriveChatBlocks(activity);
    expect(blocks.some((b) => b.type === 'audit_run_confirm')).toBe(false);
    expect(blocks.some((b) => b.type === 'tool_status')).toBe(true);
  });
});
