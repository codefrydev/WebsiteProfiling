import { describe, expect, it } from 'vitest';
import { resolveToolActivityIndex } from './parseChatSse';

describe('resolveToolActivityIndex', () => {
  it('matches by call_id when duplicate tool names are running', () => {
    const tools = [
      { id: 'call-a', name: 'list_issues', status: 'running' },
      { id: 'call-b', name: 'list_issues', status: 'running' },
    ];
    expect(resolveToolActivityIndex(tools, { callId: 'call-b', name: 'list_issues' })).toBe(1);
  });

  it('falls back to name when call_id is missing', () => {
    const tools = [{ id: 'x', name: 'get_report_summary', status: 'running' }];
    expect(resolveToolActivityIndex(tools, { name: 'get_report_summary' })).toBe(0);
  });
});
