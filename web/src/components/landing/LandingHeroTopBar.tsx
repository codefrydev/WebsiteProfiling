'use client';

import Link from 'next/link';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { LandingDeckPresentButton } from '@/components/landing/LandingDeckControls';
import { useLandingDeckRequired } from '@/components/landing/LandingDeckContext';
import { strings } from '@/lib/strings';

const NAV_ITEMS = [
  { href: '#features', labelKey: 'navFeatures' as const },
  { href: '#quick-start', labelKey: 'navQuickStart' as const },
  { href: '#spotlight-google', labelKey: 'navGoogleSetup' as const },
] as const;

/* The header is fixed chrome at real device size (outside the scaled stage), so
   it keeps viewport-based responsive gutters rather than the container-query
   gutter used by slide content. */
const headerGutter = 'px-5 sm:px-8 lg:px-10 xl:px-12';

/** Title-slide chrome: logo, section links, and primary actions (hero slide only). */
export default function LandingHeroTopBar() {
  const vl = strings.views.landing;
  const app = strings.app;
  const { presenterMode } = useLandingDeckRequired();

  if (presenterMode) {
    return (
      <div className={`flex shrink-0 items-center justify-between gap-3 border-b border-muted/40 py-3 ${headerGutter}`}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <AppLogo size={22} />
          <span className="truncate font-semibold text-foreground">{app.productName}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link
            href="/pipeline"
            className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 sm:px-3 sm:text-sm"
          >
            {vl.navRunAudit}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <header className="shrink-0 border-b border-muted/40">
      <div className={`flex h-14 w-full items-center justify-between gap-3 ${headerGutter}`}>
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
          <LandingDeckPresentButton />
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
        className={`flex gap-2 overflow-x-auto border-t border-muted/50 py-2 md:hidden ${headerGutter}`}
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
  );
}
