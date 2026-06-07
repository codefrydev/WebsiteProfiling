'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  History,
  Home,
  Link as LinkIcon,
  MessageSquarePlus,
  PanelLeft,
  Settings,
  Terminal,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import type { ChatLayoutState } from '@/components/chat/ChatShell';
import { formatChatPropertyOption } from '@/lib/chatPropertyLabel';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatSessionItem {
  id: number;
  title: string;
}

export interface PropertyOption {
  id: number;
  name: string;
  canonical_domain: string;
}

export interface ChatSidebarProps extends ChatLayoutState {
  sessions: ChatSessionItem[];
  activeSessionId: number | null;
  properties: PropertyOption[];
  propertyId: number | null;
  onPropertyChange: (id: number | null) => void;
  onNewChat: () => void;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  loading?: boolean;
}

const NAV_LINKS = [
  { href: '/home', label: c.navHome, icon: Home },
  { href: '/search-performance', label: c.navGsc, icon: TrendingUp },
  { href: '/links', label: c.navLinks, icon: LinkIcon },
  { href: '/pipeline', label: c.navPipeline, icon: Terminal },
] as const;

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
        href="/pipeline?group=llm"
        className="mt-1 block rounded-lg px-2 py-1.5 text-xs text-link hover:bg-[var(--chat-surface-hover)]"
        onClick={onClose}
      >
        {c.aiSettingsLink}
      </Link>
    </div>
  );
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  properties,
  propertyId,
  onPropertyChange,
  onNewChat,
  onSelect,
  onDelete,
  loading,
  expanded,
  toggle,
  setExpanded,
}: ChatSidebarProps) {
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

  const sessionList = (
    <>
      {loading ? (
        <p className="px-2 py-4 text-xs text-muted-foreground">{c.loadingSessions}</p>
      ) : sessions.length === 0 ? (
        <p className="px-2 py-4 text-xs text-muted-foreground">{c.noSessions}</p>
      ) : (
        <ul className="space-y-0.5">
          {sessions.map((s) => (
            <li key={s.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  activeSessionId === s.id
                    ? 'bg-brand-700/60 text-foreground'
                    : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
                }`}
                title={s.title}
              >
                {s.title}
              </button>
              <button
                type="button"
                aria-label={c.deleteSession}
                onClick={() => onDelete(s.id)}
                className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
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

        <RailButton label={c.sidebarExpand} onClick={() => setExpanded(true)}>
          <PanelLeft className="h-5 w-5" />
        </RailButton>

        <RailButton label={c.newChat} onClick={onNewChat}>
          <MessageSquarePlus className="h-5 w-5" />
        </RailButton>

        <RailButton label={c.recentChats} onClick={() => setExpanded(true)}>
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
            <span className="truncate text-sm font-medium text-bright">{c.pageTitle}</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground"
            aria-label={c.sidebarCollapse}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-muted/30 px-3 pb-3">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-default px-3 py-2 text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)]"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {c.newChat}
          </button>

          <div>
            <label
              htmlFor="chat-property-select"
              className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {c.propertyLabel}
            </label>
            <select
              id="chat-property-select"
              value={propertyId ?? ''}
              onChange={(e) => onPropertyChange(Number(e.target.value) || null)}
              className="w-full truncate rounded-lg border border-default bg-[var(--chat-bg)] px-2.5 py-1.5 text-xs text-foreground"
            >
              {!properties.length ? (
                <option value="">{c.noProperties}</option>
              ) : (
                <>
                  <option value="">{c.selectProperty}</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatChatPropertyOption(p)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        <nav className="border-b border-muted/30 px-2 py-2">
          <ul className="space-y-0.5">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {c.recentChats}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{sessionList}</div>
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
