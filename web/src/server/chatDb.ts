import { withDb } from '@/server/db';

export interface ChatSessionRow {
  id: number;
  property_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  tool_result: Record<string, unknown> | null;
  created_at: string;
}

export async function createChatSession(
  propertyId: number,
  title = 'New chat',
): Promise<number> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `INSERT INTO chat_sessions (property_id, title, created_at, updated_at)
       VALUES ($1, $2, now(), now()) RETURNING id`,
      [propertyId, title.trim() || 'New chat'],
    );
    return Number(cur.rows[0]?.id);
  });
}

export async function listChatSessions(
  propertyId: number,
  limit = 30,
): Promise<ChatSessionRow[]> {
  return withDb(async (client) => {
    const cur = await client.query<ChatSessionRow>(
      `SELECT id, property_id, title, created_at::text, updated_at::text
       FROM chat_sessions
       WHERE property_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [propertyId, Math.max(1, Math.min(limit, 100))],
    );
    return cur.rows.map((r) => ({
      ...r,
      id: Number(r.id),
      property_id: Number(r.property_id),
    }));
  });
}

export async function getChatSession(sessionId: number): Promise<ChatSessionRow | null> {
  return withDb(async (client) => {
    const cur = await client.query<ChatSessionRow>(
      `SELECT id, property_id, title, created_at::text, updated_at::text
       FROM chat_sessions WHERE id = $1`,
      [sessionId],
    );
    const row = cur.rows[0];
    if (!row) return null;
    return { ...row, id: Number(row.id), property_id: Number(row.property_id) };
  });
}

export async function deleteChatSession(sessionId: number): Promise<boolean> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `DELETE FROM chat_sessions WHERE id = $1 RETURNING id`,
      [sessionId],
    );
    return cur.rows.length > 0;
  });
}

export async function getChatMessages(
  sessionId: number,
  limit = 200,
): Promise<ChatMessageRow[]> {
  return withDb(async (client) => {
    const cur = await client.query<ChatMessageRow>(
      `SELECT id, role, content, tool_name, tool_args, tool_result, created_at::text
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [sessionId, Math.max(1, Math.min(limit, 500))],
    );
    return cur.rows.map((r) => ({
      ...r,
      id: Number(r.id),
    }));
  });
}

export async function appendChatMessage(
  sessionId: number,
  role: ChatMessageRow['role'],
  content: string,
  meta?: {
    toolName?: string | null;
    toolArgs?: Record<string, unknown> | null;
    toolResult?: Record<string, unknown> | null;
  },
): Promise<number> {
  return withDb(async (client) => {
    const cur = await client.query<{ id: string }>(
      `INSERT INTO chat_messages
         (session_id, role, content, tool_name, tool_args, tool_result, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
      [
        sessionId,
        role,
        content,
        meta?.toolName ?? null,
        meta?.toolArgs != null ? JSON.stringify(meta.toolArgs) : null,
        meta?.toolResult != null ? JSON.stringify(meta.toolResult) : null,
      ],
    );
    await client.query(
      `UPDATE chat_sessions SET updated_at = now() WHERE id = $1`,
      [sessionId],
    );
    return Number(cur.rows[0]?.id);
  });
}

export async function updateChatSessionTitle(sessionId: number, title: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE chat_sessions SET title = $2, updated_at = now() WHERE id = $1`,
      [sessionId, title.trim() || 'New chat'],
    );
  });
}

export function messagesForAgentContext(
  rows: ChatMessageRow[],
  maxTurns = 20,
): Array<{ role: string; content: string }> {
  const relevant = rows.filter((m) => m.role === 'user' || m.role === 'assistant');
  const sliced = relevant.slice(-maxTurns * 2);
  return sliced.map((m) => ({ role: m.role, content: m.content }));
}
