
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, Loader2, Maximize2, RotateCcw } from 'lucide-react';
import { strings } from '@/lib/strings';
import ChatAssistantAvatar from '@/components/chat/ChatAssistantAvatar';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatMarkdown from '@/components/chat/ChatMarkdown';
import ChatModelPicker from '@/components/chat/ChatModelPicker';
import ChatProviderPicker from '@/components/chat/ChatProviderPicker';
import ChatApiKeyBanner from '@/components/chat/ChatApiKeyBanner';
import { usePipeline } from '@/context/PipelineContext';
import { isLlmInsightsEnabled } from '@/lib/llmConfigSchema';
import { resolveChatAssistantName } from '@/lib/chatAssistantBranding';
import { useChatFabPopup } from '@/hooks/useChatFabPopup';

const c = strings.components.chat;

const QUICK_PROMPTS = c.suggestedPrompts.slice(0, 4);

const FAB_PICKER_TRIGGER_CLASS =
  'flex max-w-[6.5rem] shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 sm:max-w-[8rem]';

interface ChatFabDrawerProps {
  open: boolean;
  domain: string | null;
  onClose: () => void;
}

export default function ChatFabDrawer({ open, domain, onClose }: ChatFabDrawerProps) {
  const { llmConfigState, llmApiKeyConfigured, configLoaded } = usePipeline();
  const { messages, busy, propertyName, resolving, sendMessage, reset, openFullChat } =
    useChatFabPopup(domain);
  const bottomRef = useRef<HTMLDivElement>(null);

  const llmEnabled = isLlmInsightsEnabled(llmConfigState);
  const llmProvider = String(llmConfigState.llm_provider || 'none');
  const needsApiKey =
    llmEnabled && configLoaded && !llmApiKeyConfigured && llmProvider !== 'none' && llmProvider !== 'ollama';
  const assistantName = resolveChatAssistantName(
    String(llmConfigState.llm_chat_assistant_name || ''),
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    /* Floating popup — scales up from bottom-right origin */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Chat"
      aria-hidden={!open}
      className="print:hidden fixed bottom-6 right-4 z-[99] flex w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/[0.08] transition-all duration-300 ease-out origin-bottom-right"
      style={{
        height: 'min(580px, 80dvh)',
        transform: open ? 'scale(1)' : 'scale(0)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="relative shrink-0 bg-[var(--chat-header-bg)] px-4 pb-4 pt-4">
        {/* top row: status + actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: 'var(--status-online-ping)' }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: 'var(--status-online)' }} />
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--status-online)' }}>Online</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                title="New conversation"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--chat-header-fg-muted)] transition-colors hover:bg-white/10 hover:text-[var(--chat-header-fg)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <Link
            to={openFullChat()}
            onClick={onClose}
            title="Open full chat"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--chat-header-fg-muted)] transition-colors hover:bg-white/10 hover:text-[var(--chat-header-fg)]"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--chat-header-fg-muted)] transition-colors hover:bg-white/10 hover:text-[var(--chat-header-fg)]"
          aria-label="Close"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* avatar + title row */}
        <div className="mt-3 flex items-center gap-3">
          <ChatAssistantAvatar size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--chat-header-fg)]">{assistantName}</p>
            <p className="truncate text-[11px] text-[var(--chat-header-fg-muted)]">
              {resolving ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Resolving…
                </span>
              ) : (propertyName ?? domain) ? (
                propertyName ?? domain
              ) : (
                'Ask me anything'
              )}
            </p>
          </div>
          {llmEnabled ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ChatProviderPicker
                provider={String(llmConfigState.llm_provider || 'none')}
                disabled={busy}
                menuPlacement="below"
                triggerClassName={FAB_PICKER_TRIGGER_CLASS}
              />
              <ChatModelPicker
                provider={String(llmConfigState.llm_provider || 'none')}
                model={String(llmConfigState.llm_model || '')}
                baseUrl={String(llmConfigState.llm_base_url || '')}
                disabled={busy}
                menuPlacement="below"
                triggerClassName={FAB_PICKER_TRIGGER_CLASS}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--app-bg-elevated)]">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col gap-4">
              {needsApiKey ? <ChatApiKeyBanner provider={llmProvider} compact /> : null}
              <p className="text-center text-[12px] text-muted-foreground pt-2">
                {domain ? `Ask anything about ${domain}` : c.emptyHint}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    disabled={busy || needsApiKey}
                    className="rounded-xl border border-default/60 bg-[var(--chat-surface)]/30 px-3 py-2.5 text-left text-[12px] text-muted-foreground transition-all hover:border-[var(--accent-border)] hover:bg-[var(--chat-surface)]/70 hover:text-foreground disabled:opacity-40"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'items-end justify-start'}`}
            >
              {msg.role === 'assistant' && <ChatAssistantAvatar size="sm" />}

              {msg.role === 'user' ? (
                <div className="max-w-[82%] rounded-2xl rounded-br-none bg-[var(--chat-user-bubble)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--chat-user-bubble-fg)] shadow-sm">
                  {msg.content}
                </div>
              ) : (
                <div
                  className={`max-w-[82%] rounded-2xl rounded-bl-none px-4 py-3 shadow-sm ${
                    msg.error
                      ? 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[13px] text-[var(--color-danger)]'
                      : 'bg-[var(--chat-assistant-bubble)] text-foreground'
                  }`}
                >
                  {msg.toolStatus && (
                    <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {msg.toolStatus}
                    </div>
                  )}

                  {msg.narrative && (
                    <div className="mb-3 space-y-2">
                      {msg.narrative.power_insights.map((insight, i) => (
                        <p key={i} className="text-[13px] text-foreground/90">{insight}</p>
                      ))}
                      {msg.narrative.recommended_actions.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {msg.narrative.recommended_actions.map((action, i) => (
                            <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {msg.content ? (
                    <ChatMarkdown content={msg.content} streaming={msg.streaming} />
                  ) : !msg.toolStatus && !msg.narrative ? (
                    <div className="flex gap-1 py-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-header-fg-muted)] [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-header-fg-muted)] [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-header-fg-muted)] [animation-delay:300ms]" />
                    </div>
                  ) : null}

                  {!msg.streaming && !msg.content && msg.narrative && (
                    <Link
                      to={openFullChat()}
                      onClick={onClose}
                      className="mt-2 flex items-center gap-1 text-[11px] text-link hover:text-link-soft"
                    >
                      See full results in chat
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* ── Composer ─────────────────────────────────────── */}
        <div className="shrink-0 border-t border-default/50">
          {needsApiKey && !isEmpty ? (
            <div className="px-4 pt-3">
              <ChatApiKeyBanner provider={llmProvider} compact />
            </div>
          ) : null}
          <ChatComposer onSend={sendMessage} busy={busy} variant="compact" placeholder="Ask me anything…" disabled={needsApiKey} />
        </div>
      </div>
    </div>
  );
}
