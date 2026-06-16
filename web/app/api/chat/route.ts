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
import { loadLlmConfig } from '@/server/llmConfig';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_CHAT_TIMEOUT_MS = 120_000;
const OLLAMA_MIN_TIMEOUT_MS = 300_000;

async function resolveChatTimeoutMs(): Promise<number> {
  try {
    const cfg = await loadLlmConfig();
    const provider = String(cfg.state.llm_provider || 'none');
    const timeoutS = Number(cfg.state.llm_timeout_s) || 120;
    const baseMs = Math.max(timeoutS, 30) * 1000;
    if (provider === 'ollama') {
      return Math.max(baseMs, OLLAMA_MIN_TIMEOUT_MS);
    }
    return baseMs;
  } catch {
    return DEFAULT_CHAT_TIMEOUT_MS;
  }
}

interface ChatBody {
  sessionId?: number;
  message?: string;
  propertyId?: number;
  reportId?: number;
}

function sseLine(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildPersistedAssistantContent(
  assistantText: string,
  toolEvents: Array<{ name: string; args?: Record<string, unknown>; result?: Record<string, unknown> }>,
  sawError: boolean,
  lastErrorMessage: string,
): string | null {
  const text = assistantText.trim();
  if (text) return text;
  if (toolEvents.length > 0) {
    return sawError
      ? 'Tool results were saved from this turn. The assistant did not produce a final summary.'
      : 'Tool results from this turn are shown below.';
  }
  if (sawError && lastErrorMessage.trim()) {
    return lastErrorMessage.trim();
  }
  return null;
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

  const chatTimeoutMs = await resolveChatTimeoutMs();
  const timeoutSec = Math.round(chatTimeoutMs / 1000);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let assistantText = '';
      let buffer = '';
      let stderrAcc = '';
      let lastErrorMessage = '';
      const toolEvents: Array<{
        name: string;
        args?: Record<string, unknown>;
        result?: Record<string, unknown>;
      }> = [];
      let sawError = false;
      let timedOut = false;
      let closed = false;
      let exitCode: number | null = null;

      const closeStream = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* stream may already be closed (client disconnect, timeout race) */
        }
      };

      const push = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        if (event === 'error') {
          sawError = true;
          lastErrorMessage = String(data.message || 'Agent error');
        }
        try {
          controller.enqueue(encoder.encode(sseLine(event, data)));
        } catch {
          closed = true;
        }
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
        push('error', { message: `Chat timed out after ${timeoutSec}s` });
        closeStream();
      }, chatTimeoutMs);

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
            const evt = JSON.parse(trimmed) as {
              type?: string;
              text?: string;
              message?: string;
              phase?: string;
              detail?: string;
              name?: string;
              args?: Record<string, unknown>;
              result?: Record<string, unknown>;
            };
            if (evt.type === 'token' && evt.text) {
              assistantText += evt.text;
              push('token', { text: evt.text });
            } else if (evt.type === 'status') {
              push('status', {
                phase: evt.phase || 'working',
                detail: evt.detail || evt.message || '',
              });
            } else if (evt.type === 'tool_start') {
              toolEvents.push({
                name: String(evt.name || ''),
                args: evt.args || {},
              });
              push('tool_start', evt as Record<string, unknown>);
            } else if (evt.type === 'tool_end') {
              const name = String(evt.name || '');
              const existing = toolEvents.findIndex((t) => t.name === name && t.result == null);
              if (existing >= 0) {
                toolEvents[existing] = {
                  ...toolEvents[existing],
                  result: evt.result || {},
                };
              } else {
                toolEvents.push({ name, result: evt.result || {} });
              }
              push('tool_end', evt as Record<string, unknown>);
            } else if (evt.type === 'done' && evt.message) {
              assistantText = evt.message;
              push('done', { message: evt.message });
            } else if (evt.type === 'partial_done' && evt.message) {
              assistantText = evt.message;
              push('partial_done', { message: evt.message });
            } else if (evt.type === 'error') {
              push('error', { message: evt.message || 'Agent error' });
            }
          } catch {
            /* ignore non-JSON log lines */
          }
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrAcc += chunk.toString();
        if (stderrAcc.length > 8000) {
          stderrAcc = stderrAcc.slice(-8000);
        }
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timer);
        push('error', { message: formatPythonSpawnError(err, pythonExe, repoRoot) });
        closeStream();
      });

      proc.on('close', async (code: number | null) => {
        clearTimeout(timer);
        if (timedOut) return;
        exitCode = code;

        if (!sawError && !assistantText.trim()) {
          const stderrLine = stderrAcc
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l && !l.startsWith('['));
          const fallback =
            stderrLine ||
            (exitCode != null && exitCode !== 0
              ? `Assistant process exited with code ${exitCode}.`
              : 'No response from the assistant.');
          push('error', { message: fallback });
        } else if (!sawError && exitCode != null && exitCode !== 0) {
          const stderrLine = stderrAcc
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l && !l.startsWith('['));
          if (stderrLine) {
            push('error', { message: stderrLine });
          }
        }

        const contentToSave = buildPersistedAssistantContent(
          assistantText,
          toolEvents,
          sawError,
          lastErrorMessage,
        );

        if (contentToSave) {
          try {
            const toolResultPayload =
              toolEvents.length || (sawError && lastErrorMessage)
                ? {
                    ...(toolEvents.length ? { tool_events: toolEvents } : {}),
                    ...(sawError && lastErrorMessage ? { agent_error: lastErrorMessage } : {}),
                  }
                : null;
            await appendChatMessage(sessionId, 'assistant', contentToSave, {
              toolResult: toolResultPayload,
            });
            if (session.title === 'New chat') {
              const title = message.slice(0, 60) + (message.length > 60 ? '…' : '');
              await updateChatSessionTitle(sessionId, title);
            }
          } catch {
            /* persistence failure should not break stream */
          }
        }

        closeStream();
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
