'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  FileText,
  History,
  PanelLeft,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import type { WriteLayoutState } from '@/components/contentStudio/WriteStudioShell';
import { formatChatPropertyOption } from '@/lib/chatPropertyLabel';
import {
  isMiniNavLinkActive,
  miniNavLinks,
  WRITE_SIDEBAR_NAV_IDS,
} from '@/lib/appNav';
import { strings } from '@/lib/strings';
import type { ContentDraftListItem } from '@/types/contentStudio';

const s = strings.views.contentStudio.shell;
const c = strings.components.chat;

export interface WritePropertyOption {
  id: number;
  name: string;
  canonical_domain: string;
}

export interface WriteStudioSidebarProps extends WriteLayoutState {
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

const NAV_LINKS = miniNavLinks(WRITE_SIDEBAR_NAV_IDS);

function RailButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
        active
          ? 'bg-brand-700/80 text-foreground'
          : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SettingsMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-56 rounded-2xl border border-default bg-[var(--chat-surface)] p-3 shadow-xl">
      <p className="mb-2 text-xs font-medium text-bright">{c.settingsTitle}</p>
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
      <Link
        href="/secrets"
        className="mt-1 block rounded-lg px-2 py-1.5 text-xs text-link hover:bg-[var(--chat-surface-hover)]"
        onClick={onClose}
      >
        {c.aiSettingsLink}
      </Link>
    </div>
  );
}

export default function WriteStudioSidebar({
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
  expanded,
  toggle,
  setExpanded,
}: WriteStudioSidebarProps) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  const draftList = (
    <>
      {loadingDrafts ? (
        <p className="px-2 py-4 text-xs text-muted-foreground">{s.loadingDrafts}</p>
      ) : drafts.length === 0 ? (
        <p className="px-2 py-4 text-xs text-muted-foreground">{s.noDrafts}</p>
      ) : (
        <ul className="space-y-0.5">
          {drafts.map((d) => (
            <li key={d.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectDraft(d.id)}
                className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  activeDraftId === d.id
                    ? 'bg-brand-700/60 text-foreground'
                    : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
                }`}
                title={d.title}
              >
                {d.title}
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  aria-label={s.deleteDraft}
                  onClick={() => onDeleteDraft(d.id)}
                  className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (!expanded) {
    return (
      <div className="chat-sidebar-rail">
        <Link href="/home" className="mb-2 flex h-10 w-10 items-center justify-center" title={c.navHome}>
          <AppLogo />
        </Link>

        <RailButton label={s.expandSidebar} onClick={() => setExpanded(true)}>
          <PanelLeft className="h-5 w-5" />
        </RailButton>

        {!readOnly ? (
          <RailButton label={s.newDraft} onClick={onNewDraft}>
            <Plus className="h-5 w-5" />
          </RailButton>
        ) : null}

        <RailButton label={s.recentDrafts} onClick={() => setExpanded(true)}>
          <History className="h-5 w-5" />
        </RailButton>

        <div className="relative mt-auto" ref={settingsRef}>
          <RailButton
            label={c.settingsTitle}
            onClick={() => setSettingsOpen((v) => !v)}
            active={settingsOpen}
          >
            <Settings className="h-5 w-5" />
          </RailButton>
          {settingsOpen ? (
            <div className="absolute bottom-0 left-full z-50 ml-2">
              <SettingsMenu onClose={() => setSettingsOpen(false)} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={strings.app.ariaCloseMenu}
        className="chat-sidebar-backdrop"
        onClick={toggle}
      />

      <aside className="chat-sidebar-panel">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <Link href="/home" className="flex min-w-0 items-center gap-2">
            <AppLogo size={20} />
            <span className="truncate text-sm font-medium text-bright">{s.title}</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground"
            aria-label={s.collapseSidebar}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-muted/30 px-3 pb-3">
          {!readOnly ? (
            <button
              type="button"
              onClick={onNewDraft}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-default px-3 py-2 text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)]"
            >
              <FileText className="h-4 w-4" />
              {s.newDraft}
            </button>
          ) : null}

          <div>
            <label
              htmlFor="write-property-select"
              className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {s.propertyLabel}
            </label>
            <select
              id="write-property-select"
              value={propertyId ?? ''}
              onChange={(e) => onPropertyChange(Number(e.target.value))}
              className="w-full truncate rounded-lg border border-default bg-[var(--chat-bg)] px-2.5 py-1.5 text-xs text-foreground"
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
          </div>
        </div>

        <nav className="border-b border-muted/30 px-2 py-2">
          <ul className="space-y-0.5">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = isMiniNavLinkActive(href, pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'bg-brand-700/60 text-foreground'
                        : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.recentDrafts}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{draftList}</div>
        </div>

        <div className="relative border-t border-muted/30 p-2" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground"
            aria-expanded={settingsOpen}
          >
            <Settings className="h-4 w-4" />
            {c.settingsTitle}
          </button>
          {settingsOpen ? (
            <div className="absolute bottom-full left-2 right-2 z-50 mb-1">
              <SettingsMenu onClose={() => setSettingsOpen(false)} />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
