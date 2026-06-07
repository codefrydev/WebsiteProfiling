import { type NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuthForChat } from '@/server/auth';
import { getPipelineSpawnEnv, getRepoRoot } from '@/server/pipelineSpawnEnv';
import { formatPythonSpawnError, resolvePythonExecutable } from '@/server/resolvePython';
import {
  appendChatMessage,
  getChatMessages,
  getChatSession,
  messagesForAgentContext,
  updateChatSessionTitle,
} from '@/server/chatDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAT_TIMEOUT_MS = 120_000;

interface ChatBody {
  sessionId?: number;
  message?: string;
  propertyId?: number;
  reportId?: number;
}

function sseLine(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** POST /api/chat — stream agent response via SSE. */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuthForChat(request);
  if (authDenied) return authDenied;

  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const sessionId = Number(body.sessionId || 0);
  const propertyId = Number(body.propertyId || 0);
  const message = String(body.message || '').trim();
  const reportId = body.reportId != null ? Number(body.reportId) : undefined;

  if (!sessionId || !propertyId || !message) {
    return new Response(
      JSON.stringify({ error: 'sessionId, propertyId, and message are required' }),
      { status: 400 },
    );
  }

  const session = await getChatSession(sessionId);
  if (!session || session.property_id !== propertyId) {
    return new Response(JSON.stringify({ error: 'session not found' }), { status: 404 });
  }

  await appendChatMessage(sessionId, 'user', message);

  const history = await getChatMessages(sessionId);
  const agentMessages = messagesForAgentContext(history, 20);

  const repoRoot = getRepoRoot();
  const pythonExe = resolvePythonExecutable(null, repoRoot);
  const stdinPayload = JSON.stringify({
    messages: agentMessages,
    property_id: propertyId,
    report_id: Number.isFinite(reportId) ? reportId : undefined,
  });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let assistantText = '';
      let buffer = '';
      let timedOut = false;

      const push = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseLine(event, data)));
      };

      const proc = spawn(
        pythonExe,
        ['-m', 'src', 'chat', '--stdin-json'],
        {
          cwd: repoRoot,
          env: getPipelineSpawnEnv(repoRoot, propertyId),
          shell: false,
        },
      );

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill();
        } catch {
          /* ignore */
        }
        push('error', { message: 'Chat timed out after 120s' });
        controller.close();
      }, CHAT_TIMEOUT_MS);

      proc.stdin?.write(stdinPayload);
      proc.stdin?.end();

      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const evt = JSON.parse(trimmed) as { type?: string; text?: string; message?: string };
            if (evt.type === 'token' && evt.text) {
              assistantText += evt.text;
              push('token', { text: evt.text });
            } else if (evt.type === 'tool_start') {
              push('tool_start', evt as Record<string, unknown>);
            } else if (evt.type === 'tool_end') {
              push('tool_end', evt as Record<string, unknown>);
            } else if (evt.type === 'done' && evt.message) {
              assistantText = evt.message;
              push('done', { message: evt.message });
            } else if (evt.type === 'error') {
              push('error', { message: evt.message || 'Agent error' });
            }
          } catch {
            /* ignore non-JSON log lines */
          }
        }
      });

      proc.stderr?.on('data', () => {
        /* stderr logged by python; not forwarded to client */
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timer);
        push('error', { message: formatPythonSpawnError(err, pythonExe, repoRoot) });
        controller.close();
      });

      proc.on('close', async () => {
        clearTimeout(timer);
        if (timedOut) return;

        if (assistantText.trim()) {
          try {
            await appendChatMessage(sessionId, 'assistant', assistantText.trim());
            if (session.title === 'New chat') {
              const title = message.slice(0, 60) + (message.length > 60 ? '…' : '');
              await updateChatSessionTitle(sessionId, title);
            }
          } catch {
            /* persistence failure should not break stream */
          }
        }

        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
