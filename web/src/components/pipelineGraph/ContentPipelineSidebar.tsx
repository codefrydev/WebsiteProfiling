import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, PanelLeft, Settings } from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import type { ChatLayoutState } from '@/components/chat/ChatShell';
import {
  CONTENT_PIPELINE_SIDEBAR_NAV_IDS,
  isMiniNavLinkActive,
  miniNavLinks,
} from '@/lib/appNav';
import { strings } from '@/lib/strings';

const c = strings.components.chat;
const NAV_LINKS = miniNavLinks(CONTENT_PIPELINE_SIDEBAR_NAV_IDS);

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
        to="/secrets"
        className="mt-1 block rounded-lg px-2 py-1.5 text-xs text-link hover:bg-[var(--chat-surface-hover)]"
        onClick={onClose}
      >
        {c.aiSettingsLink}
      </Link>
    </div>
  );
}

export default function ContentPipelineSidebar({ expanded, toggle, setExpanded }: ChatLayoutState) {
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

  if (!expanded) {
    return (
      <div className="chat-sidebar-rail">
        <Link to="/home" className="mb-2 flex h-10 w-10 items-center justify-center" title={c.navHome}>
          <AppLogo />
        </Link>

        <RailButton label={c.sidebarExpand} onClick={() => setExpanded(true)}>
          <PanelLeft className="h-5 w-5" />
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
            <span className="truncate text-sm font-medium text-bright">Content Pipeline</span>
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

        <nav className="border-b border-muted/30 px-2 py-2">
          <ul className="space-y-0.5">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = isMiniNavLinkActive(href, pathname);
              return (
                <li key={href}>
                  <Link
                    to={href}
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

        <div className="flex-1" />

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
