export type ChatSseEvent =
  | { type: 'token'; text: string }
  | { type: 'status'; phase?: string; detail?: string }
  | {
      type: 'tool_start';
      callId?: string;
      name?: string;
      args?: Record<string, unknown>;
    }
  | {
      type: 'tool_end';
      callId?: string;
      name?: string;
      result?: Record<string, unknown>;
      truncated?: boolean;
      resultBytes?: number;
    }
  | {
      type: 'tool_progress';
      callId?: string;
      name?: string;
      detail?: string;
    }
  | { type: 'narrative'; narrative: { power_insights: string[]; recommended_actions: string[] } }
  | { type: 'done'; message?: string }
  | { type: 'partial_done'; message?: string }
  | { type: 'error'; message?: string };

export function resolveToolActivityIndex(
  tools: ReadonlyArray<{ id: string; name: string; status: string }>,
  evt: { callId?: string; name?: string },
): number {
  if (evt.callId) {
    const byId = tools.findIndex((t) => t.id === evt.callId);
    if (byId >= 0) {
      return byId;
    }
  }

  return tools.findIndex((t) => t.name === evt.name && t.status === 'running');
}

export function parseSseChunk(buffer: string): { events: ChatSseEvent[]; rest: string } {
  const events: ChatSseEvent[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() || '';

  for (const block of parts) {
    const lines = block.split('\n');
    let eventType = 'message';
    let dataLine = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice(6);
      }
    }
    if (!dataLine) continue;
    try {
      const data = JSON.parse(dataLine) as Record<string, unknown>;
      if (eventType === 'token') {
        events.push({ type: 'token', text: String(data.text || '') });
      } else if (eventType === 'status') {
        events.push({
          type: 'status',
          phase: String(data.phase || ''),
          detail: String(data.detail || ''),
        });
      } else if (eventType === 'tool_start') {
        events.push({
          type: 'tool_start',
          callId: data.call_id ? String(data.call_id) : undefined,
          name: String(data.name || ''),
          args: (data.args as Record<string, unknown>) || {},
        });
      } else if (eventType === 'tool_end') {
        events.push({
          type: 'tool_end',
          callId: data.call_id ? String(data.call_id) : undefined,
          name: String(data.name || ''),
          result: (data.result as Record<string, unknown>) || {},
          truncated: Boolean(data.truncated),
          resultBytes: typeof data.result_bytes === 'number' ? data.result_bytes : undefined,
        });
      } else if (eventType === 'tool_progress') {
        events.push({
          type: 'tool_progress',
          callId: data.call_id ? String(data.call_id) : undefined,
          name: String(data.name || ''),
          detail: String(data.detail || ''),
        });
      } else if (eventType === 'narrative') {
        const narrative = data.narrative as Record<string, unknown> | undefined;
        const insights = Array.isArray(narrative?.power_insights)
          ? (narrative.power_insights as unknown[]).map(String)
          : [];
        const actions = Array.isArray(narrative?.recommended_actions)
          ? (narrative.recommended_actions as unknown[]).map(String)
          : [];
        events.push({
          type: 'narrative',
          narrative: { power_insights: insights, recommended_actions: actions },
        });
      } else if (eventType === 'done') {
        events.push({ type: 'done', message: String(data.message || '') });
      } else if (eventType === 'partial_done') {
        events.push({ type: 'partial_done', message: String(data.message || '') });
      } else if (eventType === 'error') {
        events.push({ type: 'error', message: String(data.message || 'Error') });
      }
    } catch {
      /* ignore */
    }
  }

  return { events, rest };
}

export async function consumeChatSse(
  response: Response,
  onEvent: (event: ChatSseEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(buffer);
    buffer = parsed.rest;
    for (const evt of parsed.events) {
      onEvent(evt);
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseChunk(`${buffer}\n\n`);
    for (const evt of parsed.events) {
      onEvent(evt);
    }
  }
}
