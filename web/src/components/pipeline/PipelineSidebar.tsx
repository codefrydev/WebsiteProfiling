
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  PanelLeft,
  Play,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import type { ChatLayoutState } from '@/components/chat/ChatShell';
import {
  PIPELINE_SETTINGS_GROUPS,
  type PipelineSettingsGroupId,
} from '@/components/pipeline/pipelineSettingsGroups';
import { SETTINGS_GROUP_ICONS } from '@/components/pipeline/pipelineUi';
import {
  PIPELINE_SIDEBAR_NAV_IDS,
  isMiniNavLinkActive,
  miniNavLinks,
} from '@/lib/appNav';
import type { PipelineNavId } from '@/lib/pipelineNav';
import { strings } from '@/lib/strings';

const s = strings.pipelineRunner;
const c = strings.components.chat;
const groupLabels = s.settingsGroups;
const groupDescriptions = s.settingsGroupDescriptions;

const NAV_LINKS = miniNavLinks(PIPELINE_SIDEBAR_NAV_IDS);

function settingsGroupLabel(labelKey: string): string {
  return (groupLabels as Record<string, string>)[labelKey] ?? labelKey;
}

function settingsGroupDescription(labelKey: string): string {
  return (groupDescriptions as Record<string, string>)[labelKey] ?? '';
}

export interface PipelineSidebarProps extends ChatLayoutState {
  activeNav: PipelineNavId;
  onNavChange: (nav: PipelineNavId) => void;
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
        {strings.secrets.pageTitle}
      </Link>
    </div>
  );
}

function navIcon(nav: PipelineNavId): LucideIcon {
  if (nav === 'run') return Play;
  return SETTINGS_GROUP_ICONS[nav as PipelineSettingsGroupId];
}

export default function PipelineSidebar({
  activeNav,
  onNavChange,
  expanded,
  toggle,
  setExpanded,
}: PipelineSidebarProps) {
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

  const runButton = (compact: boolean) => (
    <button
      type="button"
      onClick={() => onNavChange('run')}
      className={`flex w-full items-center gap-2 rounded-lg text-left text-xs transition-colors ${
        compact ? 'px-2.5 py-2' : 'px-2.5 py-2.5'
      } ${
        activeNav === 'run'
          ? 'bg-brand-700/60 text-foreground'
          : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
      }`}
    >
      <Play className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{s.tabRun}</span>
        {!compact ? (
          <span className="truncate text-[11px] text-muted-foreground">{s.tabRunHint}</span>
        ) : null}
      </span>
    </button>
  );

  const settingsList = (
    <ul className="space-y-0.5">
      {PIPELINE_SETTINGS_GROUPS.map((group) => {
        const Icon = SETTINGS_GROUP_ICONS[group.id];
        const selected = activeNav === group.id;
        const description = settingsGroupDescription(group.labelKey);
        return (
          <li key={group.id}>
            <button
              type="button"
              onClick={() => onNavChange(group.id)}
              className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                selected
                  ? 'bg-brand-700/60 text-foreground'
                  : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{settingsGroupLabel(group.labelKey)}</span>
                {description ? (
                  <span className="truncate text-[11px] text-muted-foreground">{description}</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (!expanded) {
    const ActiveIcon = navIcon(activeNav);
    return (
      <div className="chat-sidebar-rail">
        <Link to="/home" className="mb-2 flex h-10 w-10 items-center justify-center" title={c.navHome}>
          <AppLogo />
        </Link>

        <RailButton label={s.expandSidebar} onClick={() => setExpanded(true)}>
          <PanelLeft className="h-5 w-5" />
        </RailButton>

        <RailButton
          label={activeNav === 'run' ? s.tabRun : s.settingsTitle}
          onClick={() => setExpanded(true)}
          active
        >
          <ActiveIcon className="h-5 w-5" />
        </RailButton>

        <RailButton label={s.settingsTitle} onClick={() => setExpanded(true)}>
          <SlidersHorizontal className="h-5 w-5" />
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
            <span className="truncate text-sm font-medium text-bright">{s.pageTitle}</span>
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

        <div className="border-b border-muted/30 px-2 py-2">
          <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.sidebarRunSection}
          </p>
          {runButton(false)}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.sidebarSettingsSection}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{settingsList}</div>
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
