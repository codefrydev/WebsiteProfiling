'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatComposerProps {
  disabled?: boolean;
  busy?: boolean;
  onSend: (message: string) => void;
}

export default function ChatComposer({ disabled, busy, onSend }: ChatComposerProps) {
  const [text, setText] = useState('');

  const submitDisabled = disabled || busy || !text.trim();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || submitDisabled) return;
    onSend(msg);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-muted bg-brand-900/40 p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={c.inputPlaceholder}
        rows={2}
        disabled={disabled || busy}
        className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-default bg-brand-800 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <button
        type="submit"
        disabled={submitDisabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
        aria-label={c.sendLabel}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </form>
  );
}
