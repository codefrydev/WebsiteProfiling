'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

function QuickMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-56 rounded-2xl border border-default bg-[var(--chat-surface)] p-3 shadow-xl">
      <p className="mb-2 text-xs font-medium text-bright">{c.settingsTitle}</p>
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
      <Link
        href="/settings"
        className="mt-1 block rounded-lg px-2 py-1.5 text-xs text-link hover:bg-[var(--chat-surface-hover)]"
        onClick={onClose}
      >
        {strings.settings.settingsLink}
      </Link>
      <Link
        href="/secrets"
        className="block rounded-lg px-2 py-1.5 text-xs text-link hover:bg-[var(--chat-surface-hover)]"
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
  const pathname = usePathname();
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
        <Link href="/home" className="mb-2 flex h-10 w-10 items-center justify-center" title={c.navHome}>
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
          <Link href="/home" className="flex min-w-0 items-center gap-2">
            <AppLogo size={20} />
            <span className="truncate text-sm font-medium text-bright">{title}</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground"
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

        <div className="relative border-t border-muted/30 p-2" ref={quickRef}>
          <button
            type="button"
            onClick={() => setQuickOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground"
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
