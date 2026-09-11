
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  History,
  MessageSquarePlus,
  PanelLeft,
  Settings,
  Trash2,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import type { ChatLayoutState } from '@/components/chat/ChatShell';
import {
  CHAT_SIDEBAR_NAV_IDS,
  isMiniNavLinkActive,
  miniNavLinks,
} from '@/lib/appNav';
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
  onNewChat: () => void;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  loading?: boolean;
}

const NAV_LINKS = miniNavLinks(CHAT_SIDEBAR_NAV_IDS);

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
      className={`press flex h-10 w-10 items-center justify-center rounded-full transition-colors active:scale-95 ${
        active
          ? 'bg-md-sys-surface-container-high/80 text-md-sys-on-surface'
          : 'text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface'
      }`}
    >
      {children}
    </button>
  );
}

function SettingsMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-56 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-3 shadow-xl">
      <p className="mb-2 text-xs font-medium text-md-sys-on-surface">{c.settingsTitle}</p>
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-xs text-md-sys-on-surface-variant">Theme</span>
        <ThemeToggle />
      </div>
      <Link
        to="/settings"
        className="press mt-1 block rounded-full px-3 py-1.5 text-xs font-medium text-md-sys-primary hover:bg-md-sys-surface-container-high active:scale-[0.98] transition-all"
        onClick={onClose}
      >
        {strings.settings.settingsLink}
      </Link>
      <Link
        to="/secrets"
        className="press block rounded-full px-3 py-1.5 text-xs font-medium text-md-sys-primary hover:bg-md-sys-surface-container-high active:scale-[0.98] transition-all"
        onClick={onClose}
      >
        {c.aiSettingsLink}
      </Link>
      <Link
        to="/pipeline?group=content-ai"
        className="press block rounded-full px-3 py-1.5 text-xs font-medium text-md-sys-primary hover:bg-md-sys-surface-container-high active:scale-[0.98] transition-all"
        onClick={onClose}
      >
        {c.assistantAppearanceLink}
      </Link>
    </div>
  );
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelect,
  onDelete,
  loading,
  expanded,
  toggle,
  setExpanded,
}: ChatSidebarProps) {
  const { pathname } = useLocation();
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
        <p className="px-2 py-4 text-xs text-md-sys-on-surface-variant">{c.loadingSessions}</p>
      ) : sessions.length === 0 ? (
        <p className="px-2 py-4 text-xs text-md-sys-on-surface-variant">{c.noSessions}</p>
      ) : (
        <ul className="space-y-0.5">
          {sessions.map((s) => (
            <li key={s.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`press min-w-0 flex-1 truncate rounded-full px-3 py-2 text-left text-xs transition-colors active:scale-[0.98] ${
                  activeSessionId === s.id
                    ? 'bg-md-sys-surface-container-high/60 text-md-sys-on-surface'
                    : 'text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface'
                }`}
                title={s.title}
              >
                {s.title}
              </button>
              <button
                type="button"
                aria-label={c.deleteSession}
                onClick={() => onDelete(s.id)}
                className="press rounded-full p-1.5 text-md-sys-on-surface-variant opacity-0 transition-opacity hover:text-md-sys-error hover:bg-md-sys-error-container/20 group-hover:opacity-100 active:scale-90"
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
        <Link to="/home" className="mb-2 flex h-10 w-10 items-center justify-center" title={c.navHome}>
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
          <Link to="/home" className="flex min-w-0 items-center gap-2">
            <AppLogo size={20} />
            <span className="truncate text-sm font-medium text-md-sys-on-surface">{c.pageTitle}</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="press rounded-full p-1.5 text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface active:scale-[0.98] transition-all"
            aria-label={c.sidebarCollapse}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-md-sys-outline-variant/30 px-3 pb-3">
          <button
            type="button"
            onClick={onNewChat}
            className="press flex w-full items-center justify-center gap-2 rounded-full border border-md-sys-outline-variant/40 px-3 py-2 text-sm text-md-sys-on-surface transition-colors hover:bg-md-sys-surface-container-high active:scale-[0.98]"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {c.newChat}
          </button>
        </div>

        <nav className="border-b border-md-sys-outline-variant/30 px-2 py-2">
          <ul className="space-y-0.5">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = isMiniNavLinkActive(href, pathname);
              return (
                <li key={href}>
                  <Link
                    to={href}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'bg-md-sys-surface-container-high/60 text-md-sys-on-surface'
                        : 'text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface'
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
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-md-sys-on-surface-variant">
            {c.recentChats}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{sessionList}</div>
        </div>

        <div className="relative border-t border-md-sys-outline-variant/30 p-2" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-md-sys-on-surface-variant transition-colors hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface"
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
