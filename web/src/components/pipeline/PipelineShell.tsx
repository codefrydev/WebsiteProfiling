'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Menu, Play, X } from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import Breadcrumb from '@/components/Breadcrumb';
import { strings } from '@/lib/strings';
import { readPipelineReturnPath } from '@/lib/pipelineReturn';
import {
  PIPELINE_SETTINGS_GROUPS,
  type PipelineSettingsGroupId,
} from '@/components/pipeline/pipelineSettingsGroups';
import { SETTINGS_GROUP_ICONS } from '@/components/pipeline/pipelineUi';

const s = strings.pipelineRunner;
const groupLabels = s.settingsGroups;
const groupDescriptions = s.settingsGroupDescriptions;

function settingsGroupLabel(labelKey: string): string {
  return (groupLabels as Record<string, string>)[labelKey] ?? labelKey;
}

function settingsGroupDescription(labelKey: string): string {
  return (groupDescriptions as Record<string, string>)[labelKey] ?? '';
}

export type PipelineNavId = 'run' | PipelineSettingsGroupId;

export interface PipelineShellProps {
  children: ReactNode;
  activeNav: PipelineNavId;
  onNavChange: (nav: PipelineNavId) => void;
  headerExtra?: ReactNode;
  footer?: ReactNode;
}

export default function PipelineShell({
  children,
  activeNav,
  onNavChange,
  headerExtra,
  footer,
}: PipelineShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const backHref = readPipelineReturnPath();
  const currentLabel =
    activeNav === 'run'
      ? s.runTitle
      : settingsGroupLabel(PIPELINE_SETTINGS_GROUPS.find((g) => g.id === activeNav)?.labelKey ?? '');
  const subtitle = activeNav === 'run' ? s.runSubtitle : s.settingsSubtitle;

  const closeSidebar = () => setSidebarOpen(false);

  const navItemClass = (selected: boolean) =>
    `nav-btn press relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      selected
        ? 'tab-active bg-blue-500/10 border border-blue-500/25 text-link'
        : 'text-muted-foreground hover:text-foreground hover:bg-brand-700/80'
    }`;

  const activeRail = (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-link"
    />
  );

  const selectNav = (nav: PipelineNavId) => {
    onNavChange(nav);
    closeSidebar();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-brand-900 text-foreground">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label={strings.app.ariaCloseMenu}
          className="fixed inset-0 z-30 bg-[color:var(--app-overlay)] md:hidden print:hidden"
          onClick={closeSidebar}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-64 shrink-0 flex-col border-r border-muted bg-brand-800 shadow-xl transition-transform duration-200 ease-out md:relative print:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-muted bg-brand-900/30 px-4">
          <Link
            href="/home"
            onClick={closeSidebar}
            className="flex min-w-0 items-center gap-3"
          >
            <AppLogo />
            <div className="min-w-0">
              <div className="truncate font-bold leading-tight text-bright">{strings.app.productName}</div>
              <div className="truncate text-[11px] text-muted-foreground">{s.pageTitle}</div>
            </div>
          </Link>
          <button
            type="button"
            aria-label={strings.app.ariaCloseMenu}
            className="-mr-1 rounded-lg p-2 text-muted-foreground hover:text-bright md:hidden"
            onClick={closeSidebar}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4" aria-label={s.pageTabsLabel}>
          <div className="mb-2 mt-1 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {s.sidebarRunSection}
          </div>
          <button
            type="button"
            onClick={() => selectNav('run')}
            className={navItemClass(activeNav === 'run')}
          >
            {activeNav === 'run' ? activeRail : null}
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-link">
              <Play className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate leading-tight">{s.tabRun}</span>
              <span
                className={`truncate text-[11px] font-normal leading-tight ${
                  activeNav === 'run' ? 'text-link/70' : 'text-muted-foreground'
                }`}
              >
                {s.tabRunHint}
              </span>
            </span>
          </button>

          <div className="mb-2 mt-5 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {s.sidebarSettingsSection}
          </div>
          {PIPELINE_SETTINGS_GROUPS.map((group) => {
            const Icon = SETTINGS_GROUP_ICONS[group.id];
            const selected = activeNav === group.id;
            const description = settingsGroupDescription(group.labelKey);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => selectNav(group.id)}
                className={navItemClass(selected)}
              >
                {selected ? activeRail : null}
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate leading-tight">{settingsGroupLabel(group.labelKey)}</span>
                  {description ? (
                    <span
                      className={`truncate text-[11px] font-normal leading-tight ${
                        selected ? 'text-link/70' : 'text-muted-foreground'
                      }`}
                    >
                      {description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-brand-900">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-muted bg-brand-800/80 px-4 backdrop-blur-md sm:px-6 print:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              aria-label={strings.app.ariaOpenMenu}
              className="-ml-1 shrink-0 rounded-lg p-2 text-muted-foreground hover:text-bright md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <Link
              href={backHref}
              aria-label={s.backToReports}
              className="inline-flex shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-brand-700/80 hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="sr-only">{currentLabel}</h1>
              <Breadcrumb
                items={[
                  { label: s.breadcrumbAudits, href: backHref },
                  { label: currentLabel },
                ]}
              />
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <ThemeToggle />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="fade-in">{children}</div>
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-muted bg-brand-800/95 backdrop-blur-md">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export function pipelineNavFromSearchParams(
  searchParams: URLSearchParams,
): PipelineNavId {
  const group = searchParams.get('group');
  if (
    group === 'crawl-report' ||
    group === 'lighthouse' ||
    group === 'keywords' ||
    group === 'google' ||
    group === 'content-ai' ||
    group === 'advanced'
  ) {
    return group;
  }
  if (searchParams.get('tab') === 'settings') {
    return 'crawl-report';
  }
  return 'run';
}

export function pipelineHrefForNav(
  nav: PipelineNavId,
  existingParams?: URLSearchParams,
): string {
  const params = new URLSearchParams(existingParams?.toString() ?? '');
  params.delete('tab');
  if (nav === 'run') {
    params.delete('group');
  } else {
    params.set('group', nav);
  }
  const preset = params.get('preset');
  if (preset) params.set('preset', preset);
  const q = params.toString();
  return q ? `/pipeline?${q}` : '/pipeline';
}
