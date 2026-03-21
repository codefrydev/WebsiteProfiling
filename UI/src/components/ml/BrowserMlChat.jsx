import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Send, Settings, Sparkles, User, X } from 'lucide-react';
import { strings } from '../../lib/strings';
import { useReport } from '../../context/useReport';
import { useBrowserAssistant } from '../../context/useBrowserAssistant.js';
import { MODEL_LABELS } from '../../lib/transformersClient';
import { runChatInWorker } from '../../lib/browserChatWorkerClient.js';
import { buildReportContextForChat } from '../../lib/chatReportContext.js';
import {
  buildChatToolsPrompt,
  executeChatTool,
  extractAssistantTextFromGeneration,
  mergeGenerationIntoThread,
  parseToolCallFromAssistant,
  parseUserToolCommand,
} from '../../lib/chatTools.js';
import AssistantMarkdown from './AssistantMarkdown.jsx';

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** RangeError from ONNX/WASM often surfaces as DataView "offset is out of bounds" (memory or bad cache). */
function isLikelyOnnxWasmRangeError(e) {
  if (!e || e.name !== 'RangeError') return false;
  const m = String(e.message || '');
  return /offset is out of bounds/i.test(m);
}

const URL_IN_TEXT = /(https?:\/\/[^\s]+)/g;

const SYSTEM_PROMPT_STORAGE_KEY = 'browserMlChat_systemPromptBase_v1';

function readStoredSystemPromptBase(fallback) {
  try {
    const v = localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY);
    if (v !== null) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeStoredSystemPromptBase(text) {
  try {
    localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, text);
  } catch {
    /* ignore */
  }
}

function clearStoredSystemPromptBase() {
  try {
    localStorage.removeItem(SYSTEM_PROMPT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function MessageTextWithLinks({ text, variant }) {
  const linkClass =
    variant === 'user'
      ? 'text-white underline underline-offset-2 decoration-white/50 hover:decoration-white'
      : 'text-emerald-700 underline underline-offset-2 decoration-emerald-500/45 hover:text-emerald-800 hover:decoration-emerald-600/55 dark:text-emerald-300/95 dark:decoration-emerald-400/40 dark:hover:text-emerald-200 dark:hover:decoration-emerald-300/70';
  const parts = String(text ?? '').split(URL_IN_TEXT);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function ProgressBubble({ overall, label, bytesLine, progressLabel }) {
  const pct = Math.min(100, Math.max(0, Number(overall) || 0));
  return (
    <div className="flex gap-2.5 max-w-[92%] items-end">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-400/35 bg-amber-100/70 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200/90"
        aria-hidden
      >
        <Bot className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-bl-md border border-default bg-brand-700/70 px-3.5 py-2.5 text-[11px] text-muted-foreground shadow-sm">
        <div className="mb-1.5 flex justify-between gap-2 font-mono text-[10px] text-muted-foreground">
          <span className="truncate">{progressLabel}</span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-brand-700/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400/90 to-emerald-400/85 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {label ? <p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">{label}</p> : null}
        {bytesLine ? (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground tabular-nums">{bytesLine}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function BrowserMlChat() {
  const { data, sqlDb, selectedReportId } = useReport();
  const { panelOpen, setPanelOpen, closePanel } = useBrowserAssistant();
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const closeBtnRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  const t = strings.components.browserMlChat;
  const bm = strings.components.browserMl;

  const reportContext = useMemo(
    () => buildReportContextForChat({ sqlDb, data, maxChars: 3200 }),
    [sqlDb, data]
  );

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatThread, setChatThread] = useState([]);
  const [systemPromptBase, setSystemPromptBase] = useState(() =>
    readStoredSystemPromptBase(t.chatSystemPrompt)
  );
  const [systemPromptEditorOpen, setSystemPromptEditorOpen] = useState(false);
  const [systemPromptJustSaved, setSystemPromptJustSaved] = useState(false);

  const appendMessage = useCallback((msg) => {
    setMessages((m) => [...m, { ...msg, id: msg.id || nextId() }]);
  }, []);

  useEffect(() => {
    setChatThread([]);
    setDraft('');
    setMessages([]);
  }, [selectedReportId]);

  useEffect(() => {
    if (!systemPromptJustSaved) return;
    const id = setTimeout(() => setSystemPromptJustSaved(false), 2000);
    return () => clearTimeout(id);
  }, [systemPromptJustSaved]);

  useEffect(() => {
    if (!panelOpen) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, panelOpen]);

  useEffect(() => {
    if (!panelOpen) {
      setSystemPromptEditorOpen(false);
    }
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (systemPromptEditorOpen) {
        setSystemPromptEditorOpen(false);
        return;
      }
      closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel, systemPromptEditorOpen]);

  useEffect(() => {
    if (panelOpen && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [panelOpen]);

  const sendChat = useCallback(
    async (rawText) => {
      const text = String(rawText ?? '').trim();
      if (!text || chatBusy) return;

      const toolCtx = { sqlDb, data };
      const userTool = parseUserToolCommand(text);
      if (userTool) {
        setDraft('');
        appendMessage({ role: 'user', variant: 'text', text, chat: true });
        if (userTool.name === '__unknown__') {
          appendMessage({ role: 'assistant', variant: 'text', text: t.toolUnknownCommand, chat: true });
          return;
        }
        setChatBusy(true);
        try {
          const name = userTool.name === 'help' ? 'help' : userTool.name;
          const result = executeChatTool(name, userTool.args, toolCtx);
          const display = JSON.stringify(result, null, 2);
          appendMessage({ role: 'assistant', variant: 'text', text: display, chat: true });
        } finally {
          setChatBusy(false);
        }
        return;
      }

      const systemContent = `${systemPromptBase}\n\n${buildChatToolsPrompt()}\n\n--- Report data (from this audit’s JSON + SQLite) ---\n${reportContext}\n--- End report data ---`;

      const nextThread =
        chatThread.length === 0
          ? [
              { role: 'system', content: systemContent },
              { role: 'user', content: text },
            ]
          : [...chatThread, { role: 'user', content: text }];

      setDraft('');
      setChatThread(nextThread);
      appendMessage({ role: 'user', variant: 'text', text, chat: true });
      setChatBusy(true);
      const progId = nextId();
      const assistantMsgId = nextId();
      setMessages((m) => [...m, { id: progId, role: 'system', variant: 'progress', overall: 0, label: '' }]);

      const genOptions = {
        max_new_tokens: 256,
        temperature: 0.7,
        do_sample: true,
        top_p: 0.9,
        stream: true,
      };

      const onStream = (streamText, prog, aid) => {
        setMessages((m) => {
          let next = m;
          if (m.some((x) => x.id === prog)) {
            next = m.filter((x) => x.id !== prog);
          }
          const hasAssistant = next.some((x) => x.id === aid);
          if (!hasAssistant) {
            return [...next, { id: aid, role: 'assistant', variant: 'text', text: streamText, streaming: true }];
          }
          return next.map((x) => (x.id === aid ? { ...x, text: streamText, streaming: true } : x));
        });
      };

      const finalizeAssistant = (prog, aid, replyText) => {
        const displayText = replyText || t.chatEmptyReply;
        setMessages((m) => {
          const withoutProg = m.filter((x) => x.id !== prog);
          const hasAssistant = withoutProg.some((x) => x.id === aid);
          if (!hasAssistant) {
            return [...withoutProg, { id: aid, role: 'assistant', variant: 'text', text: displayText, streaming: false }];
          }
          return withoutProg.map((x) =>
            x.id === aid ? { ...x, text: displayText, streaming: false } : x
          );
        });
      };

      try {
        let out = await runChatInWorker({
          modelId: MODEL_LABELS.chat,
          thread: nextThread,
          genOptions,
          onProgress: (u) => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === progId
                  ? { ...msg, overall: u.overall, label: u.currentFile || '', bytesLine: u.bytesLine || '' }
                  : msg
              )
            );
          },
          onStream: (streamText) => onStream(streamText, progId, assistantMsgId),
          onModelCached: () => {
            setMessages((m) => {
              let next = m;
              if (m.some((x) => x.id === progId)) {
                next = m.filter((x) => x.id !== progId);
              }
              if (next.some((x) => x.id === assistantMsgId)) return next;
              return [
                ...next,
                { id: assistantMsgId, role: 'assistant', variant: 'text', text: '', streaming: true },
              ];
            });
          },
        });

        let replyText = extractAssistantTextFromGeneration(out);
        finalizeAssistant(progId, assistantMsgId, replyText);

        let tc = parseToolCallFromAssistant(replyText);
        let threadForModel = mergeGenerationIntoThread(nextThread, out);

        if (tc) {
          setMessages((m) => m.filter((x) => x.id !== assistantMsgId));
          const toolResult = executeChatTool(tc.name, tc.args, toolCtx);
          const toolPayload = {
            role: 'user',
            content: `Tool result (${tc.name}):\n${JSON.stringify(toolResult, null, 2)}`,
          };
          threadForModel = [...threadForModel, toolPayload];

          const prog2Id = nextId();
          const assistantMsgId2 = nextId();
          setMessages((m) => [...m, { id: prog2Id, role: 'system', variant: 'progress', overall: 0, label: '' }]);

          out = await runChatInWorker({
            modelId: MODEL_LABELS.chat,
            thread: threadForModel,
            genOptions,
            onProgress: (u) => {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === prog2Id
                    ? { ...msg, overall: u.overall, label: u.currentFile || '', bytesLine: u.bytesLine || '' }
                    : msg
                )
              );
            },
            onStream: (streamText) => onStream(streamText, prog2Id, assistantMsgId2),
            onModelCached: () => {
              setMessages((m) => {
                let next = m;
                if (m.some((x) => x.id === prog2Id)) {
                  next = m.filter((x) => x.id !== prog2Id);
                }
                if (next.some((x) => x.id === assistantMsgId2)) return next;
                return [
                  ...next,
                  { id: assistantMsgId2, role: 'assistant', variant: 'text', text: '', streaming: true },
                ];
              });
            },
          });
          replyText = extractAssistantTextFromGeneration(out);
          finalizeAssistant(prog2Id, assistantMsgId2, replyText);
          threadForModel = mergeGenerationIntoThread(threadForModel, out);
        }

        setChatThread(threadForModel);
      } catch (e) {
        console.error('[BrowserMlChat] generation failed', {
          name: e?.name,
          message: e?.message,
          stack: e?.stack,
        });
        setMessages((m) =>
          m.filter((msg) => !(msg.variant === 'progress' || (msg.role === 'assistant' && msg.streaming)))
        );
        const userText = isLikelyOnnxWasmRangeError(e)
          ? t.chatErrorRangeBuffer
          : [t.chatErrorGeneric, e?.message && String(e.message)].filter(Boolean).join('\n\n');
        appendMessage({
          role: 'assistant',
          variant: 'text',
          text: userText,
          chat: true,
        });
      } finally {
        setChatBusy(false);
      }
    },
    [
      chatBusy,
      chatThread,
      reportContext,
      appendMessage,
      systemPromptBase,
      t.chatEmptyReply,
      t.chatErrorGeneric,
      t.chatErrorRangeBuffer,
      t.toolUnknownCommand,
      sqlDb,
      data,
    ]
  );

  useEffect(() => {
    if (!panelOpen) return;
    setMessages((m) => {
      if (m.length > 0) return m;
      return [
        {
          id: nextId(),
          role: 'assistant',
          variant: 'text',
          text: t.welcome,
        },
      ];
    });
  }, [panelOpen, selectedReportId, t.welcome]);

  if (data == null && sqlDb == null) return null;

  return (
    <div className="fixed bottom-0 right-0 z-[60] flex flex-col items-end gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))] print:hidden pointer-events-none">
      {panelOpen ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="pointer-events-auto w-[min(100vw-2rem,24rem)] max-h-[min(72vh,640px)] flex flex-col rounded-[1.35rem] border border-default bg-brand-800 shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-200 ease-out origin-bottom-right"
        >
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-default bg-brand-700/35 px-4 py-3">
              <div className="min-w-0 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-700 dark:text-violet-200" strokeWidth={2} />
                </span>
                <h2 id={titleId} className="text-sm font-semibold tracking-tight text-bright">
                  {t.panelTitle}
                </h2>
                <span id={descId} className="sr-only">
                  {t.welcome}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSystemPromptEditorOpen((o) => !o)}
                  className={`rounded-xl border p-2 transition-colors ${
                    systemPromptEditorOpen
                      ? 'border-violet-400/40 bg-violet-200/55 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100'
                      : 'border-transparent text-muted-foreground hover:border-default hover:bg-brand-700/50 hover:text-foreground'
                  }`}
                  aria-expanded={systemPromptEditorOpen}
                  aria-label={t.systemPromptToggleAria}
                  title={t.systemPromptToggleAria}
                >
                  <Settings className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={closePanel}
                  className="rounded-xl border border-transparent p-2 text-muted-foreground transition-colors hover:border-default hover:bg-brand-700/50 hover:text-foreground"
                  aria-label={t.closeAria}
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>

            {systemPromptEditorOpen ? (
              <div className="shrink-0 border-b border-default bg-brand-900/50 px-4 py-3 space-y-2">
                <p className="text-[11px] leading-snug text-muted-foreground">{t.systemPromptHint}</p>
                <textarea
                  value={systemPromptBase}
                  onChange={(e) => setSystemPromptBase(e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-lg border border-default bg-brand-900/80 px-3 py-2 text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/60"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      writeStoredSystemPromptBase(systemPromptBase);
                      setSystemPromptJustSaved(true);
                      setChatThread([]);
                      setMessages([]);
                    }}
                    className="rounded-lg bg-violet-600/90 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-violet-500"
                  >
                    {systemPromptJustSaved ? t.systemPromptSaved : t.systemPromptSave}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearStoredSystemPromptBase();
                      setSystemPromptBase(t.chatSystemPrompt);
                      setChatThread([]);
                      setMessages([]);
                    }}
                    className="rounded-lg border border-default px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-brand-800/80 hover:text-foreground"
                  >
                    {t.systemPromptReset}
                  </button>
                </div>
              </div>
            ) : null}

            <div
              ref={scrollRef}
              className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto bg-brand-900/30 px-4 py-4"
            >
              {messages.map((msg) => {
                if (msg.role === 'system' && msg.variant === 'progress') {
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <ProgressBubble
                        overall={msg.overall}
                        label={msg.label}
                        bytesLine={msg.bytesLine}
                        progressLabel={bm.progressLabel}
                      />
                    </div>
                  );
                }
                if (msg.role === 'user' && msg.variant === 'text') {
                  return (
                    <div key={msg.id} className="flex items-end justify-end gap-2.5">
                      <div className="max-w-[88%] rounded-2xl rounded-br-md border border-sky-400/25 bg-gradient-to-br from-sky-500/90 to-cyan-600/88 px-3.5 py-2.5 text-[13px] leading-[1.55] text-white shadow-[0_4px_14px_-4px_rgba(56,189,248,0.35)] whitespace-pre-wrap">
                        <MessageTextWithLinks text={msg.text} variant="user" />
                      </div>
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-400/40 bg-sky-100/75 text-sky-900 dark:border-sky-400/30 dark:bg-sky-500/20 dark:text-sky-100"
                        aria-hidden
                      >
                        <User className="h-4 w-4" strokeWidth={2} />
                      </span>
                    </div>
                  );
                }
                if (msg.role === 'assistant' && msg.variant === 'text') {
                  return (
                    <div key={msg.id} className="flex items-end justify-start gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-100/70 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/12 dark:text-emerald-200/95"
                        aria-hidden
                      >
                        <Bot className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 max-w-[88%] rounded-2xl rounded-bl-md border border-default bg-brand-700/70 px-3.5 py-2.5 text-foreground shadow-sm">
                        {msg.streaming ? (
                          <div className="text-[13px] leading-[1.65] text-foreground whitespace-pre-wrap">
                            {msg.text}
                            <span
                              className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-sm bg-emerald-400/85 align-middle"
                              aria-hidden
                            />
                          </div>
                        ) : (
                          <AssistantMarkdown>{msg.text}</AssistantMarkdown>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>

            <div className="shrink-0 space-y-2 border-t border-default bg-brand-900/40 px-3 py-3">
              <label className="sr-only" htmlFor="ml-chat-composer">
                {t.chatPlaceholder}
              </label>
              <div className="rounded-2xl border border-default bg-brand-700/40 p-1 shadow-inner">
                <textarea
                  id="ml-chat-composer"
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat(e.currentTarget.value);
                    }
                  }}
                  placeholder={t.chatPlaceholder}
                  disabled={chatBusy}
                  className="w-full resize-none rounded-[0.85rem] border-0 bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 disabled:opacity-50"
                />
                <div className="flex justify-end px-1.5 pb-1.5">
                  <button
                    type="button"
                    disabled={chatBusy || !draft.trim()}
                    onClick={() => sendChat(draft)}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-[12px] font-medium text-white shadow-[0_2px_12px_-2px_rgba(139,92,246,0.55)] transition hover:from-violet-500 hover:to-fuchsia-500 disabled:pointer-events-none disabled:opacity-40"
                    aria-label={t.chatSendAria}
                  >
                    {chatBusy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        {t.chatBusy}
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" aria-hidden />
                        {t.chatSend}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => (panelOpen ? closePanel() : setPanelOpen(true))}
        className="pointer-events-auto group relative flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white transition-all duration-200 ease-out hover:scale-[1.04] hover:from-violet-400 hover:to-fuchsia-500 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_6px_28px_rgba(139,92,246,0.45),0_14px_40px_-8px_rgba(0,0,0,0.5)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_8px_36px_rgba(167,139,250,0.5),0_18px_48px_-10px_rgba(0,0,0,0.55)]"
        aria-label={panelOpen ? t.closeAria : t.launcherAria}
        aria-expanded={panelOpen}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/15 to-transparent opacity-90 pointer-events-none" aria-hidden />
        {panelOpen ? (
          <X className="relative h-6 w-6 text-white" strokeWidth={2.25} />
        ) : (
          <MessageCircle className="relative h-7 w-7 text-white" strokeWidth={2.25} />
        )}
      </button>
    </div>
  );
}
