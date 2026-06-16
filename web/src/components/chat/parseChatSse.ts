export type ChatSseEvent =
  | { type: 'token'; text: string }
  | { type: 'status'; phase?: string; detail?: string }
  | { type: 'tool_start'; name?: string; args?: Record<string, unknown> }
  | { type: 'tool_end'; name?: string; result?: Record<string, unknown> }
  | { type: 'done'; message?: string }
  | { type: 'partial_done'; message?: string }
  | { type: 'error'; message?: string };

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
          name: String(data.name || ''),
          args: (data.args as Record<string, unknown>) || {},
        });
      } else if (eventType === 'tool_end') {
        events.push({
          type: 'tool_end',
          name: String(data.name || ''),
          result: (data.result as Record<string, unknown>) || {},
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
