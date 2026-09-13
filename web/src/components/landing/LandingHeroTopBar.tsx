
import { Link } from 'react-router-dom';
import AppLogo from '@/components/AppLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { strings } from '@/lib/strings';

const NAV_ITEMS = [
  { href: '/docs', label: strings.nav.docs.label },
  { href: '/chat', label: strings.nav.chat.label },
  { href: '/write', label: strings.nav.write.label },
  { href: '/secrets', label: strings.nav.secrets.label },
] as const;

/* The header is fixed chrome at real device size (outside the scaled stage), so
   it keeps viewport-based responsive gutters rather than the container-query
   gutter used by slide content. */
const headerGutter = 'px-5 sm:px-8 lg:px-10 xl:px-12';

/** Title-slide chrome: logo, section links, and primary actions (hero slide only). */
export default function LandingHeroTopBar() {
  const vl = strings.views.landing;
  const app = strings.app;

  return (
    <header className="shrink-0 border-b border-md-sys-outline-variant/40">
      <div className={`flex h-14 w-full items-center justify-between gap-3 ${headerGutter}`}>
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <AppLogo size={22} />
          <span className="truncate font-semibold text-md-sys-on-surface">{app.productName}</span>
        </Link>
        <nav
          className="hidden items-center gap-1 rounded-lg border border-md-sys-outline-variant/50 bg-md-sys-surface-container/40 p-1 md:flex"
          aria-label="Landing"
        >
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              to={href}
              className="press rounded-full px-3 py-1 text-xs font-medium text-md-sys-on-surface-variant transition-all hover:bg-md-sys-surface-container-high/60 hover:text-md-sys-on-surface active:scale-[0.98] lg:px-3.5 lg:text-sm"
            >
              {label}
            </Link>
          ))}
          <a
            href={vl.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="press rounded-full px-3 py-1 text-xs font-medium text-md-sys-on-surface-variant transition-all hover:bg-md-sys-surface-container-high/60 hover:text-md-sys-on-surface active:scale-[0.98] lg:px-3.5 lg:text-sm"
          >
            {vl.navGithub}
          </a>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link
            to="/home"
            className="press hidden rounded-full border border-md-sys-outline-variant/50 bg-md-sys-surface-container-high/40 px-3.5 py-1.5 text-xs font-medium text-md-sys-on-surface transition-all duration-200 hover:bg-md-sys-surface-container-highest active:scale-[0.98] sm:inline sm:text-sm"
          >
            {vl.navOpenApp}
          </Link>
          <Link
            to="/pipeline"
            className="press rounded-full bg-md-sys-primary px-3.5 py-1.5 text-xs font-medium text-md-sys-on-primary transition-all duration-200 hover:brightness-105 active:scale-[0.98] sm:px-4 sm:text-sm shadow-sm"
          >
            {vl.navRunAudit}
          </Link>
        </div>
      </div>
      <nav
        className={`flex gap-2 overflow-x-auto border-t border-md-sys-outline-variant/40 py-2 md:hidden ${headerGutter}`}
        aria-label="Landing mobile"
      >
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            to={href}
            className="shrink-0 rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container/50 px-3 py-1 text-xs font-medium text-md-sys-on-surface-variant"
          >
            {label}
          </Link>
        ))}
        <a
          href={vl.githubRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container/50 px-3 py-1 text-xs font-medium text-md-sys-on-surface-variant"
        >
          {vl.navGithub}
        </a>
      </nav>
    </header>
  );
}
