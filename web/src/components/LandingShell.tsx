'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { strings } from '@/lib/strings';

export interface LandingShellProps {
  children: ReactNode;
  footer?: ReactNode;
}

const NAV_ITEMS = [
  { href: '#features', labelKey: 'navFeatures' as const },
  { href: '#quick-start', labelKey: 'navQuickStart' as const },
  { href: '#google-setup', labelKey: 'navGoogleSetup' as const },
] as const;

export default function LandingShell({ children, footer }: LandingShellProps) {
  const vl = strings.views.landing;
  const app = strings.app;

  return (
    <div className="landing-grid-bg h-dvh overflow-y-auto overscroll-y-contain bg-brand-900 text-foreground">
      <header className="sticky top-0 z-40 border-b border-muted/80 bg-brand-900/90 backdrop-blur-lg backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-[var(--spacing-page-x)] sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <AppLogo size={22} />
            <span className="truncate font-semibold text-foreground">{app.productName}</span>
          </Link>
          <nav
            className="hidden items-center gap-1 rounded-lg border border-default/80 bg-brand-800/40 p-1 md:flex"
            aria-label="Landing"
          >
            {NAV_ITEMS.map(({ href, labelKey }) => (
              <a
                key={href}
                href={href}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-brand-700/60 hover:text-foreground lg:px-3 lg:text-sm"
              >
                {vl[labelKey]}
              </a>
            ))}
            <a
              href={vl.githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-brand-700/60 hover:text-foreground lg:px-3 lg:text-sm"
            >
              {vl.navGithub}
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Link
              href="/home"
              className="hidden rounded-lg border border-default px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-brand-800 sm:inline sm:text-sm"
            >
              {vl.navOpenApp}
            </Link>
            <Link
              href="/pipeline"
              className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 sm:px-3 sm:text-sm"
            >
              {vl.navRunAudit}
            </Link>
          </div>
        </div>
        <nav
          className="flex gap-2 overflow-x-auto border-t border-muted/50 px-[var(--spacing-page-x)] py-2 md:hidden"
          aria-label="Landing mobile"
        >
          {NAV_ITEMS.map(({ href, labelKey }) => (
            <a
              key={href}
              href={href}
              className="shrink-0 rounded-full border border-default bg-brand-800/50 px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              {vl[labelKey]}
            </a>
          ))}
          <a
            href={vl.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-default bg-brand-800/50 px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            {vl.navGithub}
          </a>
        </nav>
      </header>

      <main>{children}</main>

      {footer ? (
        <footer className="border-t border-muted bg-brand-800/40">{footer}</footer>
      ) : null}
    </div>
  );
}
