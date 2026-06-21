'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Plus, Send } from 'lucide-react';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatComposerProps {
  disabled?: boolean;
  busy?: boolean;
  onSend: (message: string) => void;
  trailing?: ReactNode;
  variant?: 'hero' | 'dock' | 'compact';
  draftMessage?: string;
  onDraftApplied?: () => void;
  placeholder?: string;
}

export default function ChatComposer({
  disabled,
  busy,
  onSend,
  trailing,
  variant = 'dock',
  draftMessage,
  onDraftApplied,
  placeholder,
}: ChatComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitDisabled = disabled || busy || !text.trim();

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    if (!draftMessage) return;
    setText(draftMessage);
    resizeTextarea();
    onDraftApplied?.();
    textareaRef.current?.focus();
  }, [draftMessage, onDraftApplied, resizeTextarea]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || submitDisabled) return;
    onSend(msg);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const isHero = variant === 'hero';
  const isCompact = variant === 'compact';

  return (
    <form
      onSubmit={handleSubmit}
      className={`mx-auto w-full ${isHero || isCompact ? '' : 'max-w-3xl px-4 pb-4 pt-2'} ${isCompact ? 'px-3 pb-3 pt-2' : ''}`}
    >
      <div
        className={`mx-auto flex items-end gap-1 rounded-3xl bg-[var(--chat-surface)] px-3 py-2 transition-shadow ${
          isHero
            ? 'chat-hero-input min-h-[3.5rem] sm:px-4'
            : isCompact
              ? 'min-h-[2.75rem]'
              : 'min-h-[3.25rem] shadow-lg ring-1 ring-white/[0.06] sm:px-4'
        }`}
      >
        {!isCompact && (
          <button
            type="button"
            disabled={disabled || busy}
            className={`mb-0.5 flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground disabled:opacity-40 ${
              isHero ? 'h-10 w-10' : 'h-9 w-9'
            }`}
            aria-label={c.composerAttach}
          >
            <Plus className="h-5 w-5" />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            resizeTextarea();
          }}
          placeholder={placeholder ?? c.inputPlaceholder}
          rows={1}
          disabled={disabled || busy}
          className={`max-h-40 flex-1 resize-none border-0 bg-transparent py-2 text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-0 disabled:opacity-50 ${
            isHero ? 'min-h-[2.5rem] text-[15px]' : 'min-h-[2.25rem] text-sm'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        <div className="mb-0.5 flex shrink-0 items-center gap-1">
          {trailing}
          <button
            type="submit"
            disabled={submitDisabled}
            className={`flex items-center justify-center rounded-full text-foreground transition-colors disabled:opacity-40 ${
              isHero
                ? 'h-10 w-10 bg-foreground/12 hover:bg-foreground/18'
                : 'h-9 w-9 bg-foreground/10 hover:bg-foreground/15'
            } ${text.trim() && !submitDisabled ? 'bg-foreground/20' : ''}`}
            aria-label={c.sendLabel}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </form>
  );
}
