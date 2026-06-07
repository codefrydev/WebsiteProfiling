'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatShellProps {
  children: ReactNode;
  headerExtra?: ReactNode;
}

export default function ChatShell({ children, headerExtra }: ChatShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-brand-900 text-foreground">
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-3 border-b border-muted bg-brand-900/95 px-4 backdrop-blur md:pl-4">
        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground hover:text-foreground md:hidden"
          aria-label={strings.app.ariaOpenMenu}
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/home" className="flex items-center gap-2">
          <AppLogo />
          <span className="hidden font-semibold text-bright sm:inline">{c.pageTitle}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {headerExtra}
          <Link
            href="/pipeline?group=llm"
            className="hidden text-xs text-muted-foreground hover:text-link sm:inline"
          >
            {c.aiSettingsLink}
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {sidebarOpen ? (
        <button
          type="button"
          aria-label={strings.app.ariaCloseMenu}
          className="fixed inset-0 z-30 bg-[color:var(--app-overlay)] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col pt-14">{children}</div>
    </div>
  );
}
