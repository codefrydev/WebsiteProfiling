'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bookmark,
  ChevronLeft,
  LayoutDashboard,
  MessageSquare,
  Palette,
  PanelLeft,
  PenLine,
  Settings,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import type { ChatLayoutState } from '@/components/chat/ChatShell';
import {
  SETTINGS_SIDEBAR_NAV_IDS,
  isMiniNavLinkActive,
  miniNavLinks,
} from '@/lib/appNav';
import { strings } from '@/lib/strings';

const s = strings.settings;
const c = strings.components.chat;

const NAV_LINKS = miniNavLinks(SETTINGS_SIDEBAR_NAV_IDS);

export type SettingsNavId = 'appearance' | 'layout' | 'chat' | 'writing' | 'branding' | 'defaults';

export const SETTINGS_SECTIONS: { id: SettingsNavId; label: string; icon: LucideIcon }[] = [
  { id: 'appearance', label: s.appearanceSection, icon: Palette },
  { id: 'layout', label: s.layoutSection, icon: LayoutDashboard },
  { id: 'chat', label: s.chatSection, icon: MessageSquare },
  { id: 'writing', label: s.writingSection, icon: PenLine },
  { id: 'branding', label: s.brandingSection, icon: Tag },
  { id: 'defaults', label: s.defaultsSection, icon: Bookmark },
];

export interface SettingsSidebarProps extends ChatLayoutState {
  activeSection: SettingsNavId;
  onSectionChange: (section: SettingsNavId) => void;
}

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
        href="/secrets"
        className="mt-1 block rounded-lg px-2 py-1.5 text-xs text-link hover:bg-[var(--chat-surface-hover)]"
        onClick={onClose}
      >
        API keys & secrets
      </Link>
    </div>
  );
}

export default function SettingsSidebar({
  activeSection,
  onSectionChange,
  expanded,
  toggle,
  setExpanded,
}: SettingsSidebarProps) {
  const pathname = usePathname();
  const [quickOpen, setQuickOpen] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);

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

  const sectionList = (
    <ul className="space-y-0.5">
      {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => {
        const selected = activeSection === id;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSectionChange(id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                selected
                  ? 'bg-brand-700/60 text-foreground'
                  : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (!expanded) {
    const { icon: ActiveIcon } = SETTINGS_SECTIONS.find((s2) => s2.id === activeSection) ??
      SETTINGS_SECTIONS[0];
    return (
      <div className="chat-sidebar-rail">
        <Link href="/home" className="mb-2 flex h-10 w-10 items-center justify-center" title={c.navHome}>
          <AppLogo />
        </Link>

        <RailButton label={s.expandSidebar} onClick={() => setExpanded(true)}>
          <PanelLeft className="h-5 w-5" />
        </RailButton>

        <RailButton label={s.sectionsLabel} onClick={() => setExpanded(true)} active>
          <ActiveIcon className="h-5 w-5" />
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
            <span className="truncate text-sm font-medium text-bright">{s.sidebarTitle}</span>
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
            {s.sectionsLabel}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{sectionList}</div>
        </div>

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
