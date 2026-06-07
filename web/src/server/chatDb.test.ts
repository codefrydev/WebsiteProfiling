import { describe, expect, it } from 'vitest';
import { messagesForAgentContext, type ChatMessageRow } from './chatDb';

describe('messagesForAgentContext', () => {
  it('returns only user and assistant roles capped by maxTurns', () => {
    const rows: ChatMessageRow[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({
        id: i,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `m${i}`,
        tool_name: null,
        tool_args: null,
        tool_result: null,
        created_at: '',
      });
    }
    rows.push({
      id: 99,
      role: 'tool',
      content: 'tool output',
      tool_name: 'list_issues',
      tool_args: null,
      tool_result: null,
      created_at: '',
    });
    const out = messagesForAgentContext(rows, 5);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });
});
