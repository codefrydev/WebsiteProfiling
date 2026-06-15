'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { strings } from '@/lib/strings';
import { Button } from '@/components';

export interface NewDraftModalProps {
  open: boolean;
  initialKeyword?: string;
  onClose: () => void;
  onCreate: (fields: {
    title: string;
    target_keyword: string;
    landing_url: string | null;
  }) => void;
  creating: boolean;
}

export default function NewDraftModal({
  open,
  initialKeyword = '',
  onClose,
  onCreate,
  creating,
}: NewDraftModalProps) {
  const s = strings.views.contentStudio.newDraft;
  const [title, setTitle] = useState('');
  const [keyword, setKeyword] = useState(initialKeyword);
  const [landingUrl, setLandingUrl] = useState('');

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw) return;
    onCreate({
      title: title.trim() || kw,
      target_keyword: kw,
      landing_url: landingUrl.trim() || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-draft-title"
    >
      <div className="w-full max-w-md rounded-xl border border-default bg-brand-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-default px-4 py-3">
          <h3 id="new-draft-title" className="text-sm font-semibold text-bright">
            {s.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label={s.close}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
          <label className="block text-xs text-muted-foreground">
            {s.targetKeyword}
            <input
              type="text"
              required
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
              placeholder={s.keywordPlaceholder}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            {s.draftTitle}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
              placeholder={s.titlePlaceholder}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            {s.landingUrl}
            <input
              type="url"
              value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
              placeholder="https://"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {s.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={creating} disabled={!keyword.trim()}>
              {creating ? s.creating : s.create}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
