import { describe, expect, it } from 'vitest';
import { isChatNarrative, narrativeFromToolResult } from '@/types/chatNarrative';

describe('chatNarrative types', () => {
  it('validates narrative shape', () => {
    expect(
      isChatNarrative({
        power_insights: ['one'],
        recommended_actions: [],
      }),
    ).toBe(true);
    expect(isChatNarrative({ power_insights: [], recommended_actions: [] })).toBe(false);
    expect(isChatNarrative(null)).toBe(false);
  });

  it('reads narrative from tool_result', () => {
    const narrative = narrativeFromToolResult({
      tool_events: [],
      narrative: {
        power_insights: ['x'],
        recommended_actions: ['y'],
      },
    });
    expect(narrative?.power_insights).toEqual(['x']);
  });
});
