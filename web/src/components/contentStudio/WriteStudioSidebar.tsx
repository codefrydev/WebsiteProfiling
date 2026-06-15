'use client';

import Link from 'next/link';
import { FileText, Home, PanelLeft, PenLine, Plus, Terminal, Trash2 } from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import { formatChatPropertyOption } from '@/lib/chatPropertyLabel';
import { strings } from '@/lib/strings';
import type { ContentDraftListItem } from '@/types/contentStudio';

export interface WritePropertyOption {
  id: number;
  name: string;
  canonical_domain: string;
}

export interface WriteStudioSidebarProps {
  expanded: boolean;
  onToggle: () => void;
  properties: WritePropertyOption[];
  propertyId: number | null;
  onPropertyChange: (id: number) => void;
  drafts: ContentDraftListItem[];
  activeDraftId: number | null;
  onSelectDraft: (id: number) => void;
  onNewDraft: () => void;
  onDeleteDraft: (id: number) => void;
  loadingDrafts?: boolean;
  readOnly?: boolean;
}

export default function WriteStudioSidebar({
  expanded,
  onToggle,
  properties,
  propertyId,
  onPropertyChange,
  drafts,
  activeDraftId,
  onSelectDraft,
  onNewDraft,
  onDeleteDraft,
  loadingDrafts,
  readOnly,
}: WriteStudioSidebarProps) {
  const s = strings.views.contentStudio.shell;

  if (!expanded) {
    return (
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-default bg-brand-950 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-brand-800 hover:text-foreground"
          title={s.expandSidebar}
          aria-label={s.expandSidebar}
        >
          <PanelLeft className="h-5 w-5" aria-hidden />
        </button>
        <Link
          href="/home"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-brand-800 hover:text-foreground"
          title={s.navHome}
        >
          <Home className="h-5 w-5" aria-hidden />
        </Link>
        {!readOnly ? (
          <button
            type="button"
            onClick={onNewDraft}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-link hover:bg-brand-800"
            title={s.newDraft}
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-default bg-brand-950">
      <div className="flex items-center gap-2 border-b border-default px-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-brand-800 hover:text-foreground"
          aria-label={s.collapseSidebar}
        >
          <PanelLeft className="h-4 w-4" aria-hidden />
        </button>
        <AppLogo className="h-6 w-auto" />
        <span className="text-sm font-semibold text-foreground truncate">{s.title}</span>
      </div>

      <div className="border-b border-default p-3 space-y-2">
        <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          {s.propertyLabel}
          <select
            value={propertyId ?? ''}
            onChange={(e) => onPropertyChange(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-default bg-brand-900 px-2 py-1.5 text-xs text-foreground"
          >
            {properties.length === 0 ? (
              <option value="">{s.noProperties}</option>
            ) : (
              properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatChatPropertyOption(p)}
                </option>
              ))
            )}
          </select>
        </label>
        {!readOnly ? (
          <button
            type="button"
            onClick={onNewDraft}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {s.newDraft}
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{s.draftsLabel}</p>
        {loadingDrafts ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{s.loadingDrafts}</p>
        ) : drafts.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{s.noDrafts}</p>
        ) : (
          <ul className="space-y-0.5">
            {drafts.map((d) => {
              const active = activeDraftId === d.id;
              return (
                <li key={d.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectDraft(d.id)}
                    className={`flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                      active
                        ? 'bg-accent/15 text-foreground'
                        : 'text-muted-foreground hover:bg-brand-800 hover:text-foreground'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="block truncate opacity-70">{d.target_keyword || s.untitled}</span>
                    </span>
                  </button>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(d.id)}
                      className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500"
                      title={s.deleteDraft}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-default p-2 space-y-0.5">
        <Link
          href="/home"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-brand-800 hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" aria-hidden />
          {s.navHome}
        </Link>
        <Link
          href="/pipeline"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-brand-800 hover:text-foreground"
        >
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          {s.navPipeline}
        </Link>
        <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground">
          <PenLine className="h-3.5 w-3.5 text-link" aria-hidden />
          {s.title}
        </div>
      </div>
    </aside>
  );
}
