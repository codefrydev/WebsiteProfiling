import { describe, expect, it } from 'vitest';
import { formatToolDisplayName, statusFromSseEvent } from '@/components/chat/chatStatusLabels';

describe('chatStatusLabels', () => {
  it('formats known tool names', () => {
    expect(formatToolDisplayName('get_traffic_health_check')).toBe('Traffic health');
    expect(formatToolDisplayName('list_issues')).toBe('Issue list');
  });

  it('maps model status to step label', () => {
    expect(
      statusFromSseEvent({
        type: 'status',
        phase: 'model',
        detail: 'Planning step 2 of 10…',
      }),
    ).toContain('2');
  });

  it('maps tool_start to running label', () => {
    const label = statusFromSseEvent({
      type: 'tool_start',
      name: 'list_issues',
    });
    expect(label.toLowerCase()).toContain('issue');
  });

  it('maps token to writing summary label', () => {
    const label = statusFromSseEvent({ type: 'token' });
    expect(label.toLowerCase()).toContain('summary');
  });
});
