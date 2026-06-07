'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import ChatShell from '@/components/chat/ChatShell';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatMessageList, { type ChatMessage } from '@/components/chat/ChatMessageList';
import ChatComposer from '@/components/chat/ChatComposer';
import SuggestedPrompts from '@/components/chat/SuggestedPrompts';
import LlmDisclosure from '@/components/LlmDisclosure';
import { usePipeline } from '@/context/PipelineContext';
import { apiUrl } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import { consumeChatSse } from '@/components/chat/parseChatSse';
import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';

const c = strings.components.chat;

interface PropertyOption {
  id: number;
  name: string;
  canonical_domain: string;
}

interface SessionRow {
  id: number;
  property_id: number;
  title: string;
}

export default function ChatPage() {
  const { configState, llmConfigState } = usePipeline();
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState('');

  const llmEnabled =
    llmConfigState.llm_enabled === true &&
    String(llmConfigState.llm_provider || 'none') !== 'none';

  const loadProperties = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/properties'));
      if (!res.ok) return;
      const data = (await res.json()) as { properties?: PropertyOption[] };
      const rows = data.properties || [];
      setProperties(rows);
      const activeRaw = configState.active_property_id;
      const activeId = activeRaw ? Number(activeRaw) : null;
      if (activeId && rows.some((p) => p.id === activeId)) {
        setPropertyId(activeId);
      } else if (rows.length) {
        setPropertyId(rows[0].id);
      }
    } catch {
      /* ignore */
    }
  }, [configState.active_property_id]);

  const loadSessions = useCallback(async (pid: number) => {
    setLoadingSessions(true);
    try {
      const res = await fetch(apiUrl(`/chat/sessions?propertyId=${pid}`));
      if (!res.ok) throw new Error('Failed to load sessions');
      const data = (await res.json()) as { sessions?: SessionRow[] };
      setSessions(data.sessions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadMessages = useCallback(async (sid: number) => {
    try {
      const res = await fetch(apiUrl(`/chat/sessions/${sid}/messages`));
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages?: Array<{ id: number; role: string; content: string }>;
      };
      setMessages(
        (data.messages || [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    if (propertyId) void loadSessions(propertyId);
  }, [propertyId, loadSessions]);

  useEffect(() => {
    if (sessionId) void loadMessages(sessionId);
    else setMessages([]);
  }, [sessionId, loadMessages]);

  const createSession = async (): Promise<number | null> => {
    if (!propertyId) return null;
    const res = await fetch(apiUrl('/chat/sessions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: number };
    await loadSessions(propertyId);
    return data.id;
  };

  const handleNewChat = async () => {
    const id = await createSession();
    if (id) {
      setSessionId(id);
      setMessages([]);
    }
  };

  const handleSend = async (text: string) => {
    if (!propertyId || !llmEnabled) return;
    setError('');
    setBusy(true);

    let sid = sessionId;
    if (!sid) {
      sid = await createSession();
      if (!sid) {
        setBusy(false);
        setError(c.sessionError);
        return;
      }
      setSessionId(sid);
    }

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', streaming: true, toolActivity: [] },
    ]);

    try {
      const res = await fetch(apiUrl('/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, propertyId, message: text }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || 'Chat request failed');
      }

      let content = '';
      const tools: ToolActivityItem[] = [];

      await consumeChatSse(res, (evt) => {
        if (evt.type === 'token') {
          content += evt.text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content, streaming: true } : m,
            ),
          );
        } else if (evt.type === 'tool_start') {
          tools.push({
            id: `${evt.name}-${tools.length}`,
            name: evt.name || 'tool',
            args: evt.args,
            status: 'running',
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, toolActivity: [...tools] } : m,
            ),
          );
        } else if (evt.type === 'tool_end') {
          const idx = tools.findIndex((t) => t.name === evt.name && t.status === 'running');
          if (idx >= 0) {
            tools[idx] = { ...tools[idx], result: evt.result, status: 'done' };
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, toolActivity: [...tools] } : m,
            ),
          );
        } else if (evt.type === 'done' && evt.message) {
          content = evt.message;
        } else if (evt.type === 'error') {
          setError(evt.message || c.agentError);
        }
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: content || m.content, streaming: false, toolActivity: tools }
            : m,
        ),
      );
      if (propertyId) await loadSessions(propertyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSession = async (id: number) => {
    await fetch(apiUrl(`/chat/sessions/${id}`), { method: 'DELETE' });
    if (sessionId === id) {
      setSessionId(null);
      setMessages([]);
    }
    if (propertyId) await loadSessions(propertyId);
  };

  return (
    <ChatShell
      headerExtra={
        <select
          value={propertyId ?? ''}
          onChange={(e) => {
            setPropertyId(Number(e.target.value) || null);
            setSessionId(null);
            setMessages([]);
          }}
          className="max-w-[12rem] truncate rounded-lg border border-default bg-brand-800 px-2 py-1.5 text-xs text-foreground sm:max-w-xs"
          aria-label={c.propertyLabel}
        >
          {!properties.length ? (
            <option value="">{c.noProperties}</option>
          ) : (
            properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.canonical_domain}
              </option>
            ))
          )}
        </select>
      }
    >
      <div className="flex min-h-0 flex-1">
        <ChatSidebar
          sessions={sessions}
          activeSessionId={sessionId}
          onNewChat={() => void handleNewChat()}
          onSelect={(id) => setSessionId(id)}
          onDelete={(id) => void handleDeleteSession(id)}
          loading={loadingSessions}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {!llmEnabled ? (
            <div className="m-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-medium text-amber-100">{c.aiDisabledTitle}</p>
                <p className="mt-1 text-muted-foreground">{c.aiDisabledHint}</p>
                <Link href="/pipeline?group=llm" className="mt-2 inline-block text-link text-xs">
                  {c.openAiSettings}
                </Link>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mx-4 mt-2 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <ChatMessageList
            messages={messages}
            empty={messages.length === 0}
          />

          {messages.length === 0 && llmEnabled ? (
            <div className="px-4 pb-4">
              <SuggestedPrompts onSelect={(p) => void handleSend(p)} disabled={busy || !propertyId} />
            </div>
          ) : null}

          <div className="shrink-0">
            {llmEnabled ? (
              <div className="px-4 py-1">
                <LlmDisclosure
                  llmMeta={{
                    model: String(llmConfigState.llm_model || llmConfigState.llm_provider || 'AI'),
                  }}
                />
              </div>
            ) : null}
            <ChatComposer
              disabled={!llmEnabled || !propertyId}
              busy={busy}
              onSend={(msg) => void handleSend(msg)}
            />
          </div>
        </div>
      </div>
    </ChatShell>
  );
}
