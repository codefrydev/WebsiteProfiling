'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import ChatContextBar from '@/components/chat/ChatContextBar';
import ChatShell from '@/components/chat/ChatShell';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatMessageList, { type ChatMessage } from '@/components/chat/ChatMessageList';
import ChatComposer from '@/components/chat/ChatComposer';
import SuggestedPrompts from '@/components/chat/SuggestedPrompts';
import ChatModelPicker from '@/components/chat/ChatModelPicker';
import ChatActivityBar from '@/components/chat/ChatActivityBar';
import { ChatFollowUpProvider } from '@/components/chat/ChatFollowUpContext';
import { usePipeline } from '@/context/PipelineContext';
import { apiUrl } from '@/lib/publicBase';
import { format, strings } from '@/lib/strings';
import { consumeChatSse } from '@/components/chat/parseChatSse';
import { deriveChatBlocks, toolEventsToActivity } from '@/components/chat/deriveChatBlocks';
import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';
import {
  buildChatSearchQuery,
  parseChatUrlContext,
  readStoredChatContext,
  writeStoredChatContext,
} from '@/lib/chatUrlState';
import {
  normalizePropertyId,
  pickInitialPropertyId,
  propertyIdsEqual,
} from '@/lib/googlePropertySelection';

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { configState, llmConfigState } = usePipeline();
  const initialUrlCtx = parseChatUrlContext(searchParams);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(initialUrlCtx.propertyId);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(initialUrlCtx.sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(Boolean(initialUrlCtx.sessionId));
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [error, setError] = useState('');
  const [activityText, setActivityText] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [composerDraft, setComposerDraft] = useState('');
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(false);
  const messagesLoadGen = useRef(0);
  const sessionRestoredForProperty = useRef<number | null>(null);

  const searchKey = searchParams.toString();

  const replaceChatUrl = useCallback(
    (nextPropertyId: number | null, nextSessionId: number | null) => {
      const q = buildChatSearchQuery(searchKey, {
        propertyId: nextPropertyId,
        sessionId: nextSessionId,
      });
      if (q === searchKey) return;
      if (nextPropertyId) {
        writeStoredChatContext({ propertyId: nextPropertyId, sessionId: nextSessionId });
      }
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchKey],
  );

  const suggestFollowUp = useCallback((prompt: string) => {
    setComposerDraft(prompt);
  }, []);

  const llmEnabled =
    llmConfigState.llm_enabled === true &&
    String(llmConfigState.llm_provider || 'none') !== 'none';

  const showConversation = Boolean(sessionId) || messages.length > 0 || busy || loadingMessages;
  const isHero = !showConversation;
  const activeProperty = properties.find((p) => propertyIdsEqual(p.id, propertyId)) ?? null;
  const activeSession = sessions.find((s) => s.id === sessionId) ?? null;

  const loadProperties = useCallback(async () => {
    setLoadingProperties(true);
    try {
      const res = await fetch(apiUrl('/properties'));
      if (!res.ok) return;
      const data = (await res.json()) as { properties?: PropertyOption[] };
      const rows = (data.properties || []).map((p) => ({
        ...p,
        id: normalizePropertyId(p.id) ?? p.id,
      }));
      setProperties(rows);
      const urlCtx = parseChatUrlContext(
        new URLSearchParams(
          typeof window !== 'undefined' ? window.location.search : '',
        ),
      );
      const stored = readStoredChatContext();
      const explicitId = urlCtx.propertyId ?? stored.propertyId ?? null;
      const nextId = pickInitialPropertyId(rows, {
        explicitId,
        startUrl: String(configState.start_url || ''),
        activePropertyId: String(configState.active_property_id || ''),
      });
      setPropertyId((current) => {
        if (nextId != null) return nextId;
        return current != null ? null : current;
      });
    } catch {
      /* ignore */
    } finally {
      setLoadingProperties(false);
    }
  }, [configState.active_property_id, configState.start_url]);

  const resolveSessionFromUrl = useCallback(async (sid: number, pid: number | null) => {
    try {
      const res = await fetch(apiUrl(`/chat/sessions/${sid}`));
      if (!res.ok) return false;
      const data = (await res.json()) as { session?: SessionRow };
      const session = data.session;
      if (!session) return false;
      if (pid != null && session.property_id !== pid) {
        setPropertyId(session.property_id);
      }
      setSessionId(session.id);
      return true;
    } catch {
      return false;
    }
  }, []);

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
    const gen = ++messagesLoadGen.current;
    setLoadingMessages(true);
    try {
      const res = await fetch(apiUrl(`/chat/sessions/${sid}/messages`));
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages?: Array<{
          id: number;
          role: string;
          content: string;
          tool_result?: Record<string, unknown> | null;
        }>;
      };
      if (gen !== messagesLoadGen.current) return;
      setMessages(
        (data.messages || [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => {
            const toolActivity = toolEventsToActivity(m.tool_result);
            const blocks = toolActivity.length ? deriveChatBlocks(toolActivity) : undefined;
            return {
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              toolActivity: toolActivity.length ? toolActivity : undefined,
              blocks: blocks?.length ? blocks : undefined,
            };
          }),
      );
    } catch {
      /* ignore */
    } finally {
      if (gen === messagesLoadGen.current) {
        setLoadingMessages(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    if (propertyId) void loadSessions(propertyId);
  }, [propertyId, loadSessions]);

  useEffect(() => {
    setUrlSyncEnabled(false);
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId || loadingSessions) return;
    if (sessionRestoredForProperty.current === propertyId) return;

    const urlCtx = parseChatUrlContext(searchParams);
    const stored = readStoredChatContext();
    const preferredSession = urlCtx.sessionId ?? stored.sessionId;

    const finishRestore = () => {
      sessionRestoredForProperty.current = propertyId;
      setUrlSyncEnabled(true);
    };

    if (!preferredSession) {
      finishRestore();
      return;
    }

    if (sessions.some((s) => s.id === preferredSession)) {
      setSessionId(preferredSession);
      finishRestore();
      return;
    }

    void resolveSessionFromUrl(preferredSession, propertyId).then((ok) => {
      if (!ok && urlCtx.sessionId === preferredSession) {
        setSessionId(null);
        setMessages([]);
      }
      finishRestore();
    });
  }, [propertyId, sessions, loadingSessions, searchParams, resolveSessionFromUrl]);

  useEffect(() => {
    if (!propertyId || !urlSyncEnabled || loadingSessions) return;
    replaceChatUrl(propertyId, sessionId);
  }, [propertyId, sessionId, urlSyncEnabled, loadingSessions, replaceChatUrl]);

  useEffect(() => {
    if (busy) return;
    if (sessionId) void loadMessages(sessionId);
    else setMessages([]);
  }, [sessionId, loadMessages, busy]);

  useEffect(() => {
    if (!busy || !startedAt) {
      setElapsedSec(0);
      return;
    }
    const tick = () => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy, startedAt]);

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
      setLoadingMessages(false);
      setError('');
    }
  };

  const handleSend = async (text: string) => {
    if (!propertyId || !llmEnabled) return;
    messagesLoadGen.current += 1;
    setError('');
    setActivityText(c.sending);
    setStartedAt(Date.now());
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
      let streamError = '';
      const tools: ToolActivityItem[] = [];

      const patchAssistant = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
        );
      };

      await consumeChatSse(res, (evt) => {
        if (evt.type === 'status' && evt.detail) {
          setActivityText(evt.detail);
          patchAssistant({ statusText: evt.detail, streaming: true });
        } else if (evt.type === 'token') {
          content += evt.text;
          setActivityText(c.writing);
          patchAssistant({ content, streaming: true, statusText: c.writing, error: false });
        } else if (evt.type === 'tool_start') {
          setActivityText(format(c.toolStatus, { name: evt.name || 'tool' }));
          tools.push({
            id: `${evt.name}-${tools.length}`,
            name: evt.name || 'tool',
            args: evt.args,
            status: 'running',
          });
          patchAssistant({
            toolActivity: [...tools],
            blocks: deriveChatBlocks(tools),
            streaming: true,
            statusText: format(c.toolStatus, { name: evt.name || 'tool' }),
          });
        } else if (evt.type === 'tool_end') {
          const idx = tools.findIndex((t) => t.name === evt.name && t.status === 'running');
          if (idx >= 0) {
            tools[idx] = { ...tools[idx], result: evt.result, status: 'done' };
          }
          patchAssistant({
            toolActivity: [...tools],
            blocks: deriveChatBlocks(tools),
            streaming: true,
          });
        } else if (evt.type === 'done' && evt.message) {
          content = evt.message;
          patchAssistant({ content: evt.message, streaming: true, error: false });
        } else if (evt.type === 'error') {
          streamError = evt.message || c.agentError;
          setError(streamError);
          patchAssistant({
            content: streamError,
            streaming: false,
            error: true,
            statusText: undefined,
            toolActivity: tools,
          });
        }
      });

      if (!streamError) {
        const finalContent = content.trim();
        if (!finalContent) {
          const emptyMsg = c.emptyResponse;
          setError(emptyMsg);
          patchAssistant({
            content: emptyMsg,
            streaming: false,
            error: true,
            toolActivity: tools,
          });
        } else {
          patchAssistant({
            content: finalContent,
            streaming: false,
            error: false,
            toolActivity: tools,
            blocks: deriveChatBlocks(tools),
          });
        }
        if (sid) await loadMessages(sid);
      }
      if (propertyId) await loadSessions(propertyId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: msg, streaming: false, error: true }
            : m,
        ),
      );
    } finally {
      setBusy(false);
      setActivityText('');
      setStartedAt(null);
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

  const modelPicker = llmEnabled ? (
    <ChatModelPicker
      provider={String(llmConfigState.llm_provider || 'none')}
      model={String(llmConfigState.llm_model || '')}
      baseUrl={String(llmConfigState.llm_base_url || '')}
      disabled={busy}
    />
  ) : null;

  const composer = (
    <ChatComposer
      disabled={!llmEnabled || !propertyId}
      busy={busy}
      onSend={(msg) => void handleSend(msg)}
      trailing={modelPicker}
      variant={isHero ? 'hero' : 'dock'}
      draftMessage={composerDraft}
      onDraftApplied={() => setComposerDraft('')}
    />
  );

  const errorStrip = error ? (
    <div
      className="mx-auto flex w-full max-w-3xl items-start gap-2 px-4 pb-2 text-xs text-red-300"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>{error}</p>
    </div>
  ) : null;

  return (
    <ChatFollowUpProvider suggestFollowUp={suggestFollowUp}>
    <ChatShell
      sidebar={(layout) => (
        <ChatSidebar
          {...layout}
          sessions={sessions}
          activeSessionId={sessionId}
          properties={properties}
          propertyId={propertyId}
          onPropertyChange={(id) => {
            sessionRestoredForProperty.current = null;
            setUrlSyncEnabled(false);
            setPropertyId(id);
            setSessionId(null);
            setMessages([]);
            setLoadingMessages(false);
            messagesLoadGen.current += 1;
            setError('');
          }}
          onNewChat={() => void handleNewChat()}
          onSelect={(id) => {
            setSessionId(id);
            setLoadingMessages(true);
          }}
          onDelete={(id) => void handleDeleteSession(id)}
          loading={loadingSessions}
        />
      )}
    >
      {(layout) => (
        <div className="chat-main-panel">
          <ChatContextBar
            property={activeProperty}
            propertyId={propertyId}
            sessionTitle={activeSession?.title}
            loading={loadingProperties}
            onExpandSidebar={layout.expanded ? undefined : () => layout.setExpanded(true)}
          />
          {!llmEnabled ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
              <div className="flex max-w-md items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="font-medium text-amber-100">{c.aiDisabledTitle}</p>
                  <p className="mt-1 text-muted-foreground">{c.aiDisabledHint}</p>
                  <Link href="/pipeline?group=llm" className="mt-2 inline-block text-link text-xs">
                    {c.openAiSettings}
                  </Link>
                </div>
              </div>
            </div>
          ) : isHero ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[10vh] pt-4">
              <div className="flex w-full max-w-3xl flex-col items-center">
                <h1 className="text-center text-[2rem] font-normal tracking-tight text-bright sm:text-5xl sm:font-light">
                  {c.emptyHeadline}
                </h1>
                <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">
                  {c.emptySubline}
                </p>
                <div className="mt-10 w-full">{composer}</div>
                <SuggestedPrompts onSelect={(p) => void handleSend(p)} disabled={busy || !propertyId} />
              </div>
            </div>
          ) : (
            <div className="chat-conversation">
              {loadingMessages && messages.length === 0 ? (
                <div className="chat-messages-scroll flex items-center justify-center px-4 text-sm text-muted-foreground">
                  {c.loadingMessages}
                </div>
              ) : (
                <ChatMessageList messages={messages} empty={false} />
              )}
              <div className="chat-composer-dock">
                <ChatActivityBar busy={busy} statusText={activityText} elapsedSec={elapsedSec} />
                {errorStrip}
                {composer}
              </div>
            </div>
          )}
        </div>
      )}
    </ChatShell>
    </ChatFollowUpProvider>
  );
}
