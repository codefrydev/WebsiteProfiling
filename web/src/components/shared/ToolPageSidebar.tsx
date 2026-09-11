
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  PanelLeft,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import type { ChatLayoutState } from '@/components/chat/ChatShell';
import { isMiniNavLinkActive, miniNavLinks, type NavItemId } from '@/lib/appNav';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

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

function QuickMenu({ onClose }: { onClose: () => void }) {
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
        API keys &amp; secrets
      </Link>
    </div>
  );
}

export interface ToolPageSidebarProps extends ChatLayoutState {
  navIds: readonly NavItemId[];
  title: string;
  railIcon: LucideIcon;
}

export default function ToolPageSidebar({
  navIds,
  title,
  railIcon: RailIcon,
  expanded,
  toggle,
  setExpanded,
}: ToolPageSidebarProps) {
  const { pathname } = useLocation();
  const [quickOpen, setQuickOpen] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);
  const navLinks = miniNavLinks(navIds);

  useEffect(() => {
    if (!quickOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setQuickOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [quickOpen]);

  if (!expanded) {
    return (
      <div className="chat-sidebar-rail">
        <Link to="/home" className="mb-2 flex h-10 w-10 items-center justify-center" title={c.navHome}>
          <AppLogo />
        </Link>

        <RailButton label="Expand sidebar" onClick={() => setExpanded(true)}>
          <PanelLeft className="h-5 w-5" />
        </RailButton>

        <RailButton label={title} onClick={() => setExpanded(true)} active>
          <RailIcon className="h-5 w-5" />
        </RailButton>

        <div className="relative mt-auto" ref={quickRef}>
          <RailButton
            label={c.settingsTitle}
            onClick={() => setQuickOpen((v) => !v)}
            active={quickOpen}
          >
            <Settings className="h-5 w-5" />
          </RailButton>
          {quickOpen ? (
            <div className="absolute bottom-0 left-full z-50 ml-2">
              <QuickMenu onClose={() => setQuickOpen(false)} />
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
            <span className="truncate text-sm font-medium text-md-sys-on-surface">{title}</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="press rounded-full p-1.5 text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface active:scale-[0.98] transition-all"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="space-y-0.5">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = isMiniNavLinkActive(href, pathname);
              return (
                <li key={href}>
                  <Link
                    to={href}
                    className={`press flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors active:scale-[0.98] ${
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

        <div className="relative border-t border-md-sys-outline-variant/30 p-2" ref={quickRef}>
          <button
            type="button"
            onClick={() => setQuickOpen((v) => !v)}
            className="press flex w-full items-center gap-2 rounded-full px-3 py-2 text-xs text-md-sys-on-surface-variant transition-colors hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface active:scale-[0.98]"
            aria-expanded={quickOpen}
          >
            <Settings className="h-4 w-4" />
            {c.settingsTitle}
          </button>
          {quickOpen ? (
            <div className="absolute bottom-full left-2 right-2 z-50 mb-1">
              <QuickMenu onClose={() => setQuickOpen(false)} />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
