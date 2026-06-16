import { describe, expect, it } from 'vitest';
import { parseSseChunk } from './parseChatSse';

describe('parseSseChunk', () => {
  it('parses token and done events', () => {
    const chunk =
      'event: token\ndata: {"text":"Hi"}\n\n' +
      'event: done\ndata: {"message":"Done"}\n\n';
    const { events, rest } = parseSseChunk(chunk);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'token', text: 'Hi' });
    expect(events[1]).toEqual({ type: 'done', message: 'Done' });
    expect(rest).toBe('');
  });

  it('parses tool events', () => {
    const chunk =
      'event: tool_start\ndata: {"name":"list_issues","args":{"limit":5}}\n\n';
    const { events } = parseSseChunk(chunk);
    expect(events[0]?.type).toBe('tool_start');
    if (events[0]?.type === 'tool_start') {
      expect(events[0].name).toBe('list_issues');
    }
  });

  it('keeps incomplete block in rest buffer', () => {
    const { events, rest } = parseSseChunk('event: token\ndata: {"text":');
    expect(events).toHaveLength(0);
    expect(rest).toContain('event: token');
  });

  it('parses narrative events', () => {
    const chunk =
      'event: narrative\ndata: {"narrative":{"power_insights":["A"],"recommended_actions":["B"]}}\n\n';
    const { events } = parseSseChunk(chunk);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'narrative',
      narrative: { power_insights: ['A'], recommended_actions: ['B'] },
    });
  });
});
