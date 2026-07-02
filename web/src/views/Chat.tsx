
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import ChatContextBar from '@/components/chat/ChatContextBar';
import ChatShell from '@/components/chat/ChatShell';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatMessageList, {
  agentErrorFromToolResult,
  narrativeFromToolResult,
  narrativeFromLegacyContent,
  type ChatMessage,
} from '@/components/chat/ChatMessageList';
import ChatComposer from '@/components/chat/ChatComposer';
import SuggestedPrompts from '@/components/chat/SuggestedPrompts';
import ChatModelPicker from '@/components/chat/ChatModelPicker';
import ChatProviderPicker from '@/components/chat/ChatProviderPicker';
import ChatUnlimitedToolsToggle from '@/components/chat/ChatUnlimitedToolsToggle';
import ChatApiKeyBanner from '@/components/chat/ChatApiKeyBanner';
import ChatActivityBar from '@/components/chat/ChatActivityBar';
import { ChatFollowUpProvider } from '@/components/chat/ChatFollowUpContext';
import { usePipeline } from '@/context/PipelineContext';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings } from '@/lib/strings';
import { statusFromSseEvent } from '@/components/chat/chatStatusLabels';
import { consumeChatSse, resolveToolActivityIndex } from '@/components/chat/parseChatSse';
import { toolEventsToActivity } from '@/components/chat/deriveChatBlocks';
import type { ChatNarrative } from '@/types/chatNarrative';
import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';
import {
  buildChatSearchQuery,
  clearChatComposerDraft,
  parseChatUrlContext,
  readChatComposerDraft,
  readStoredChatContext,
  resolvePreferredChatSession,
  normalizeChatSessionRow,
  normalizeSessionId,
  sessionIdsEqual,
  upsertChatSession,
  type ChatSessionRow,
  writeStoredChatContext,
} from '@/lib/chatUrlState';
import {
  isLlmInsightsEnabled,
  parseLlmBool,
} from '@/lib/llmConfigSchema';
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

export default function ChatPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { configState, configLoaded, llmConfigState, llmApiKeyConfigured } = usePipeline();
  const initialUrlCtx = parseChatUrlContext(searchParams);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(initialUrlCtx.propertyId);
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(initialUrlCtx.sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(Boolean(initialUrlCtx.propertyId));
  const [loadingMessages, setLoadingMessages] = useState(Boolean(initialUrlCtx.sessionId));
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [error, setError] = useState('');
  const [activityText, setActivityText] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [composerDraft, setComposerDraft] = useState('');
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(false);
  const messagesLoadGen = useRef(0);
  const sessionsLoadGen = useRef(0);
  const sessionRestoredForProperty = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      navigate(q ? `${pathname}?${q}` : pathname, { replace: true, preventScrollReset: true });
    },
    [navigate, pathname, searchKey],
  );

  const suggestFollowUp = useCallback((prompt: string) => {
    setComposerDraft(prompt);
  }, []);

  const llmEnabled = isLlmInsightsEnabled(llmConfigState);
  const llmProvider = String(llmConfigState.llm_provider || 'none');
  const needsApiKey =
    llmEnabled && configLoaded && !llmApiKeyConfigured && llmProvider !== 'none' && llmProvider !== 'ollama';

  const crawlChatEnabled = parseLlmBool(llmConfigState.llm_chat_allow_crawl);

  const showConversation = Boolean(sessionId) || messages.length > 0 || busy || loadingMessages;
  const isHero = !showConversation;
  const activeProperty = properties.find((p) => propertyIdsEqual(p.id, propertyId)) ?? null;
  const activeSession = sessions.find((s) => sessionIdsEqual(s.id, sessionId)) ?? null;
  const contextSessionTitle = useMemo(() => {
    if (activeSession?.title && activeSession.title !== 'New chat') {
      return activeSession.title;
    }
    const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
    if (firstUser?.content.trim()) {
      return firstUser.content.trim().slice(0, 80);
    }
    return activeSession?.title ?? null;
  }, [activeSession, messages]);

  const loadProperties = useCallback(async () => {
    if (!configLoaded) return;
    setLoadingProperties(true);
    try {
      const res = await apiFetch(apiUrl('/properties'));
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
      const domainFromUrl =
        searchParams.get('domain') ?? searchParams.get('brand') ?? '';
      const domainStartUrl = domainFromUrl.trim()
        ? domainFromUrl.startsWith('http')
          ? domainFromUrl.trim()
          : `https://${domainFromUrl.trim()}`
        : '';
      const nextId = pickInitialPropertyId(rows, {
        explicitId,
        startUrl: domainStartUrl || String(configState.start_url || ''),
        activePropertyId: String(configState.active_property_id || ''),
      });
      setPropertyId((current) => {
        if (nextId != null) return nextId;
        if (urlCtx.propertyId != null) return urlCtx.propertyId;
        return current;
      });
    } catch {
      /* ignore */
    } finally {
      setLoadingProperties(false);
    }
  }, [configLoaded, configState.active_property_id, configState.start_url, searchParams]);

  const resolveSessionFromUrl = useCallback(async (sid: number, pid: number | null) => {
    try {
      const res = await apiFetch(apiUrl(`/chat/sessions/${sid}`));
      if (!res.ok) return false;
      const data = (await res.json()) as { session?: ChatSessionRow };
      const session = data.session ? normalizeChatSessionRow(data.session) : null;
      if (!session) return false;
      if (pid != null && session.propertyId !== pid) {
        setPropertyId(session.propertyId);
      }
      setSessions((prev) => upsertChatSession(prev, session));
      setSessionId(session.id);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadSessions = useCallback(async (pid: number) => {
    const gen = ++sessionsLoadGen.current;
    setLoadingSessions(true);
    try {
      const res = await apiFetch(apiUrl(`/chat/sessions?propertyId=${pid}`));
      if (!res.ok) throw new Error('Failed to load sessions');
      const data = (await res.json()) as { sessions?: ChatSessionRow[] };
      if (gen !== sessionsLoadGen.current) return;
      setSessions(
        (data.sessions || [])
          .map((row) => normalizeChatSessionRow(row))
          .filter((row): row is ChatSessionRow => row != null),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === sessionsLoadGen.current) {
        setLoadingSessions(false);
      }
    }
  }, []);

  const loadMessages = useCallback(async (sid: number, pid: number) => {
    const gen = ++messagesLoadGen.current;
    setLoadingMessages(true);
    try {
      const res = await apiFetch(apiUrl(`/chat/sessions/${sid}/messages?propertyId=${pid}`));
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
            const agentError = agentErrorFromToolResult(m.tool_result);
            const narrative =
              narrativeFromToolResult(m.tool_result) ??
              (m.role === 'assistant' ? narrativeFromLegacyContent(m.content) : undefined);
            return {
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: narrative ? '' : m.content,
              narrative,
              toolActivity: toolActivity.length ? toolActivity : undefined,
              partialError: Boolean(agentError && toolActivity.length > 0),
              agentError,
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
    if (!configLoaded) return;
    void loadProperties();
  }, [configLoaded, loadProperties]);

  useEffect(() => {
    const domainFromUrl = searchParams.get('domain') ?? searchParams.get('brand') ?? '';
    const draft = readChatComposerDraft(domainFromUrl);
    if (draft) {
      setComposerDraft(draft);
      clearChatComposerDraft();
    }
  }, [searchParams]);

  useEffect(() => {
    setUrlSyncEnabled(false);
    sessionRestoredForProperty.current = null;
    if (!propertyId) {
      setLoadingSessions(false);
      setSessions([]);
      return;
    }
    setLoadingSessions(true);
    void loadSessions(propertyId);
  }, [propertyId, loadSessions]);

  useEffect(() => {
    if (!propertyId || loadingSessions) return;
    if (sessionRestoredForProperty.current === propertyId) return;

    const urlCtx = parseChatUrlContext(searchParams);
    const stored = readStoredChatContext();
    const preferredSession = resolvePreferredChatSession(propertyId, urlCtx, stored, sessions);

    const finishRestore = () => {
      sessionRestoredForProperty.current = propertyId;
      setUrlSyncEnabled(true);
    };

    if (!preferredSession) {
      finishRestore();
      return;
    }

    if (sessions.some((s) => sessionIdsEqual(s.id, preferredSession))) {
      setSessionId(normalizeSessionId(preferredSession));
      finishRestore();
      return;
    }

    void resolveSessionFromUrl(preferredSession, propertyId).then((ok) => {
      if (!ok) {
        if (urlCtx.sessionId === preferredSession) {
          setSessionId(null);
          setMessages([]);
        } else if (sessions.length > 0) {
          setSessionId(sessions[0]!.id);
        }
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
    if (sessionId && propertyId) void loadMessages(sessionId, propertyId);
    else if (!sessionId) setMessages([]);
  }, [sessionId, propertyId, loadMessages, busy]);

  useEffect(() => {
    if (!sessionId || !propertyId) return;
    if (sessions.some((s) => sessionIdsEqual(s.id, sessionId))) return;
    void resolveSessionFromUrl(sessionId, propertyId);
  }, [sessionId, propertyId, sessions, resolveSessionFromUrl]);

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

  // Abort any in-flight chat stream when the page unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const createSession = async (): Promise<number | null> => {
    if (!propertyId) return null;
    const res = await apiFetch(apiUrl('/chat/sessions'), {
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

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await apiFetch(apiUrl('/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, propertyId, message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || 'Chat request failed');
      }

      let content = '';
      let narrative: ChatNarrative | undefined;
      let streamError = '';
      const tools: ToolActivityItem[] = [];
      let lastProgressAt = 0;

      const patchAssistant = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
        );
      };

      await consumeChatSse(res, (evt) => {
        if (evt.type === 'status' && evt.detail) {
          const label = statusFromSseEvent(evt);
          setActivityText(label);
          patchAssistant({ statusText: label, streaming: true });
        } else if (evt.type === 'token') {
          const label = statusFromSseEvent(evt);
          setActivityText(label);
          patchAssistant({ streaming: true, statusText: label, error: false });
        } else if (evt.type === 'narrative_partial') {
          narrative = evt.narrative;
          patchAssistant({
            narrative: evt.narrative,
            streaming: true,
            statusText: undefined,
            error: false,
            partialError: false,
          });
        } else if (evt.type === 'tool_start') {
          const callId = evt.callId || `${evt.name}-${tools.length}`;
          const label = statusFromSseEvent(evt);
          setActivityText(label);
          tools.push({
            id: callId,
            name: evt.name || 'tool',
            args: evt.args,
            status: 'running',
          });
          patchAssistant({
            toolActivity: [...tools],
            streaming: true,
            statusText: label,
          });
        } else if (evt.type === 'tool_progress' && evt.detail) {
          const now = Date.now();
          if (now - lastProgressAt < 100) {
            return;
          }
          lastProgressAt = now;
          const label = statusFromSseEvent(evt);
          setActivityText(label);
          patchAssistant({
            streaming: true,
            statusText: label,
          });
        } else if (evt.type === 'tool_end') {
          const idx = resolveToolActivityIndex(tools, evt);
          if (idx >= 0) {
            tools[idx] = { ...tools[idx], result: evt.result, status: 'done' };
          }
          patchAssistant({
            toolActivity: [...tools],
            streaming: true,
          });
        } else if (evt.type === 'narrative') {
          narrative = evt.narrative;
          patchAssistant({
            narrative: evt.narrative,
            streaming: true,
            error: false,
            partialError: false,
          });
        } else if (evt.type === 'done') {
          patchAssistant({
            content: evt.message || content,
            narrative,
            streaming: true,
            error: false,
            partialError: false,
          });
        } else if (evt.type === 'partial_done' && evt.message) {
          content = evt.message;
          patchAssistant({
            content: evt.message,
            streaming: true,
            error: false,
            partialError: true,
            toolActivity: tools,
          });
        } else if (evt.type === 'error') {
          streamError = evt.message || c.agentError;
          const hasTools = tools.length > 0;
          const hasNarrativeContent = Boolean(
            narrative &&
              (narrative.power_insights.length > 0 || narrative.recommended_actions.length > 0),
          );
          if (!hasNarrativeContent) {
            setError(streamError);
          }
          const fallbackContent =
            content.trim() || (hasTools ? c.partialToolsSaved : streamError);
          patchAssistant({
            content: fallbackContent,
            narrative,
            streaming: false,
            error: !hasTools && !hasNarrativeContent,
            partialError: hasTools && !hasNarrativeContent,
            agentError: hasNarrativeContent ? null : streamError,
            statusText: undefined,
            toolActivity: tools,
          });
        }
      });

      if (!streamError) {
        const hasNarrative = Boolean(
          narrative &&
            (narrative.power_insights.length > 0 || narrative.recommended_actions.length > 0),
        );
        const finalContent = content.trim();
        if (!hasNarrative && !finalContent && tools.length === 0) {
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
            narrative,
            streaming: false,
            error: false,
            partialError: false,
            toolActivity: tools,
          });
        }
      } else if (tools.length > 0) {
        patchAssistant({
          narrative,
          streaming: false,
          partialError: true,
          agentError: streamError,
          toolActivity: tools,
        });
      }
      if (sid && propertyId) await loadMessages(sid, propertyId);
      if (propertyId) await loadSessions(propertyId);
    } catch (e) {
      // Aborted (session switch / delete / unmount): not a user-facing error.
      // The message-load effect re-runs once busy clears and restores the
      // correct session, so leave the assistant placeholder alone here.
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
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
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      setActivityText('');
      setStartedAt(null);
    }
  };

  const handleDeleteSession = async (id: number) => {
    if (!propertyId) return;
    if (sessionId === id) abortRef.current?.abort();
    try {
      await apiFetch(apiUrl(`/chat/sessions/${id}?propertyId=${propertyId}`), { method: 'DELETE' });
      if (sessionId === id) {
        setSessionId(null);
        setMessages([]);
      }
      await loadSessions(propertyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete session');
    }
  };

  const modelPicker = llmEnabled ? (
    <>
      <ChatUnlimitedToolsToggle disabled={busy} />
      <ChatProviderPicker
        provider={String(llmConfigState.llm_provider || 'none')}
        disabled={busy}
      />
      <ChatModelPicker
        provider={String(llmConfigState.llm_provider || 'none')}
        model={String(llmConfigState.llm_model || '')}
        baseUrl={String(llmConfigState.llm_base_url || '')}
        disabled={busy}
      />
    </>
  ) : null;

  const composer = (
    <ChatComposer
      disabled={!llmEnabled || !propertyId || needsApiKey}
      busy={busy}
      onSend={(msg) => void handleSend(msg)}
      trailing={modelPicker}
      variant={isHero ? 'hero' : 'dock'}
      draftMessage={composerDraft}
      onDraftApplied={() => setComposerDraft('')}
    />
  );

  const apiKeyStrip = needsApiKey ? (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <ChatApiKeyBanner provider={llmProvider} />
    </div>
  ) : null;

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
            abortRef.current?.abort();
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
            if (id !== sessionId) abortRef.current?.abort();
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
            sessionTitle={contextSessionTitle}
            loading={loadingProperties}
            crawlActionsEnabled={crawlChatEnabled && llmEnabled}
          />
          {!llmEnabled ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
              <div className="flex max-w-md items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="font-medium text-amber-100">{c.aiDisabledTitle}</p>
                  <p className="mt-1 text-muted-foreground">{c.aiDisabledHint}</p>
                  <Link to="/pipeline?group=content-ai" className="mt-2 inline-block text-link text-xs">
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
                <div className="mt-10 w-full space-y-3">
                  {apiKeyStrip}
                  {composer}
                </div>
                <SuggestedPrompts
                  onSelect={(p) => void handleSend(p)}
                  disabled={busy || !propertyId || needsApiKey}
                  crawlEnabled={crawlChatEnabled}
                />
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
                {apiKeyStrip}
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
