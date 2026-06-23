
import { useCallback, useRef, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { consumeChatSse, type ChatSseEvent } from '@/components/chat/parseChatSse';
import type { ChatNarrative } from '@/types/chatNarrative';

export interface FabChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  toolStatus?: string;
  narrative?: ChatNarrative;
}

export interface UseChatFabPopupReturn {
  messages: FabChatMessage[];
  busy: boolean;
  propertyId: number | null;
  propertyName: string | null;
  resolving: boolean;
  sendMessage: (text: string) => void;
  reset: () => void;
  openFullChat: () => string;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useChatFabPopup(domain: string | null): UseChatFabPopupReturn {
  const [messages, setMessages] = useState<FabChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const sessionIdRef = useRef<number | null>(null);
  const propertyIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolveProperty = useCallback(async (): Promise<number | null> => {
    if (propertyIdRef.current) return propertyIdRef.current;
    if (!domain) return null;
    setResolving(true);
    try {
      const res = await apiFetch(apiUrl('/properties'));
      const data = (await res.json()) as {
        properties?: Array<{ id: number; canonical_domain?: string; name?: string }>;
      };
      const match = (data.properties ?? []).find(
        (p) =>
          (p.canonical_domain ?? '').toLowerCase() === domain.toLowerCase(),
      );
      if (match) {
        propertyIdRef.current = match.id;
        setPropertyId(match.id);
        setPropertyName(match.name ?? domain);
        return match.id;
      }
    } catch {
      /* ignore */
    } finally {
      setResolving(false);
    }
    return null;
  }, [domain]);

  const ensureSession = useCallback(async (pid: number): Promise<number | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const res = await apiFetch(apiUrl('/chat/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: pid, title: 'Quick chat' }),
      });
      const data = (await res.json()) as { id?: number };
      if (data.id) {
        sessionIdRef.current = data.id;
        return data.id;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || busy) return;

      const userMsg: FabChatMessage = { id: makeId(), role: 'user', content: text };
      const assistantId = makeId();
      const assistantMsg: FabChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const pid = await resolveProperty();
          if (!pid) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: 'Could not find a property for this domain. Open the full chat to select one.',
                      streaming: false,
                      error: true,
                    }
                  : m,
              ),
            );
            setBusy(false);
            return;
          }

          const sid = await ensureSession(pid);
          if (!sid) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: 'Could not create a chat session.', streaming: false, error: true }
                  : m,
              ),
            );
            setBusy(false);
            return;
          }

          const res = await apiFetch(apiUrl('/chat'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sid, propertyId: pid, message: text }),
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          let lastNarrative: ChatNarrative | null = null;

          await consumeChatSse(res, (evt: ChatSseEvent) => {
            if (evt.type === 'token') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + evt.text } : m,
                ),
              );
            } else if (evt.type === 'status') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolStatus: evt.detail || evt.phase || 'Working…' }
                    : m,
                ),
              );
            } else if (evt.type === 'tool_start') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolStatus: `Running ${evt.name ?? 'tool'}…` }
                    : m,
                ),
              );
            } else if (evt.type === 'tool_end') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, toolStatus: undefined } : m,
                ),
              );
            } else if (evt.type === 'narrative') {
              lastNarrative = evt.narrative;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, narrative: evt.narrative, toolStatus: undefined }
                    : m,
                ),
              );
            } else if (evt.type === 'done' || evt.type === 'partial_done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, streaming: false, toolStatus: undefined }
                    : m,
                ),
              );
            } else if (evt.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: evt.message || 'An error occurred.',
                        streaming: false,
                        error: true,
                        toolStatus: undefined,
                      }
                    : m,
                ),
              );
            }
          });

          // Ensure streaming flag is cleared even if done event was missed
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, streaming: false, toolStatus: undefined, narrative: lastNarrative ?? m.narrative }
                : m,
            ),
          );
        } catch (err: unknown) {
          const e = err as Error;
          if (e.name === 'AbortError') return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: 'Connection error. Please try again.', streaming: false, error: true }
                : m,
            ),
          );
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, resolveProperty, ensureSession],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    setMessages([]);
    setBusy(false);
  }, []);

  const openFullChat = useCallback((): string => {
    const trimmed = (domain ?? '').trim();
    if (!trimmed) return '/chat';
    return `/chat?domain=${encodeURIComponent(trimmed)}`;
  }, [domain]);

  return { messages, busy, propertyId, propertyName, resolving, sendMessage, reset, openFullChat };
}
