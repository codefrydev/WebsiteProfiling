'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ExternalLink,
  Menu,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import IntegrationsModal from '@/components/IntegrationsModal';
import { Badge, ReportSelector } from '@/components';
import ThemeToggle from '@/components/ThemeToggle';
import { useReport } from '@/context/useReport';
import { strings, format } from '@/lib/strings';
import { canonicalDomainFromPayload } from '@/lib/domainSlug';
import { OPEN_INTEGRATIONS } from '@/lib/pipelineJobEvents';
import {
  APP_NAV_ITEMS,
  APP_NAV_SECTIONS,
  isNavItemActive,
  navHref,
  type NavItemId,
} from '@/lib/appNav';
import type { ReportPayload } from '@/types';
import {
  getBrowserDiagnosticsScope,
  getLinksWithBrowserErrors,
} from '@/lib/browserErrors';

interface IntegrationsToast {
  type: 'success' | 'error';
  message: string;
}

interface ReportCategoryWithIssues {
  issues?: unknown[];
}

export interface AppShellProps {
  children: ReactNode;
  showSidebar?: boolean;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  headerExtra?: ReactNode;
}

export default function AppShell({
  children,
  showSidebar = true,
  showSearch = true,
  searchQuery = '',
  onSearchChange,
  headerExtra,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [integrationsToast, setIntegrationsToast] = useState<IntegrationsToast | null>(null);
  const { data, startUrlByRunId } = useReport();

  const trailing = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    const intParam = searchParams.get('integrations');
    const authParam = searchParams.get('auth');
    const reasonParam = searchParams.get('reason');
    if (intParam === 'open') {
      setIntegrationsOpen(true);
      if (authParam === 'success') {
        setIntegrationsToast({ type: 'success', message: 'Google account connected successfully.' });
      } else if (authParam === 'error') {
        setIntegrationsToast({
          type: 'error',
          message: reasonParam ? decodeURIComponent(reasonParam) : 'Google connection failed.',
        });
      }
      const next = new URLSearchParams(searchParams.toString());
      next.delete('integrations');
      next.delete('auth');
      next.delete('reason');
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setIntegrationsToast(null);
      setIntegrationsOpen(true);
    };
    window.addEventListener(OPEN_INTEGRATIONS, onOpen);
    return () => window.removeEventListener(OPEN_INTEGRATIONS, onOpen);
  }, []);

  const openIntegrations = () => {
    setIntegrationsToast(null);
    setIntegrationsOpen(true);
  };

  const issueCount =
    (data?.categories as ReportCategoryWithIssues[] | undefined)?.reduce(
      (n: number, c: ReportCategoryWithIssues) => n + (c.issues?.length ?? 0),
      0,
    ) ?? 0;
  const securityFindings = data?.security_findings;
  const securityCount = Array.isArray(securityFindings) ? securityFindings.length : 0;
  const jsErrorScope = getBrowserDiagnosticsScope(data);
  const jsErrorPageCount = jsErrorScope.usesBrowser ? getLinksWithBrowserErrors(data?.links).length : 0;

  const auditedHost =
    canonicalDomainFromPayload(data, startUrlByRunId) || strings.app.defaultSiteName;
  const runId = data?.crawl_run_id != null ? Number(data.crawl_run_id) : null;
  const auditedStartUrl =
    (runId != null ? startUrlByRunId?.get(runId) : null) ||
    (auditedHost ? `https://${auditedHost}` : '');
  const auditedInitials = auditedHost.charAt(0).toUpperCase() || 'S';
  const crawlSummary = data?.summary as (ReportPayload['summary'] & { crawl_time_s?: number }) | undefined;
  const lastCrawlText =
    crawlSummary?.crawl_time_s != null
      ? format(strings.app.crawlCompletedSeconds, { seconds: crawlSummary.crawl_time_s })
      : strings.app.crawlCompleted;

  return (
    <div className={`min-h-screen bg-brand-900 text-foreground overflow-hidden ${showSidebar ? 'flex' : 'block'}`}>
      {showSidebar && sidebarOpen ? (
        <button
          type="button"
          aria-label={strings.app.ariaCloseMenu}
          className="fixed inset-0 z-30 print:hidden bg-[color:var(--app-overlay)] md:hidden"
          onClick={closeSidebar}
        />
      ) : null}

      {showSidebar ? (
        <aside
          className={`inset-y-0 left-0 w-64 bg-brand-800 border-r border-muted flex flex-col h-screen shrink-0 z-40 shadow-xl print:hidden transition-transform duration-200 ease-out fixed md:relative ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="h-16 flex items-center justify-between px-6 border-b border-muted bg-brand-900/30 shrink-0">
            <Link href="/home" className="flex items-center min-w-0" onClick={closeSidebar}>
              <AppLogo className="mr-3" />
              <div className="min-w-0">
                <div className="font-bold text-bright leading-tight truncate">
                  {strings.app.productName}
                </div>
                <div className="text-[11px] text-muted-foreground">{strings.app.productSubtitle}</div>
              </div>
            </Link>
            <button
              type="button"
              aria-label={strings.app.ariaCloseMenu}
              className="md:hidden p-2 -mr-2 text-muted-foreground hover:text-bright rounded-lg"
              onClick={closeSidebar}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {APP_NAV_SECTIONS.map((section) => (
              <div key={section}>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-4 px-2 first:mt-0">
                  {section}
                </div>
                {APP_NAV_ITEMS.filter((item) => item.section === section).map((item) => {
                  const Icon = item.icon;
                  const href = navHref(item, trailing);
                  const isActive = isNavItemActive(item, pathname);
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      onClick={closeSidebar}
                      className={`nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'tab-active bg-blue-500/10 border border-blue-500/25 text-link'
                          : 'text-muted-foreground hover:text-foreground hover:bg-brand-700/80'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.id === 'issues' && issueCount > 0 ? (
                        <Badge variant="high" label={String(issueCount)} className="shrink-0" />
                      ) : null}
                      {item.id === 'security' && securityCount > 0 ? (
                        <Badge variant="medium" label={String(securityCount)} className="shrink-0" />
                      ) : null}
                      {item.id === 'javascript-errors' && jsErrorPageCount > 0 ? (
                        <Badge variant="high" label={String(jsErrorPageCount)} className="shrink-0" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-muted bg-brand-900/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
                {auditedInitials}
              </div>
              <div className="text-xs min-w-0">
                <div className="text-bright font-bold truncate">{auditedHost}</div>
                <div className="text-muted-foreground">{lastCrawlText}</div>
              </div>
            </div>
            {auditedStartUrl ? (
              <a
                href={auditedStartUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span>{strings.app.viewSiteLabel}</span>
              </a>
            ) : null}
          </div>
        </aside>
      ) : null}

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-brand-900 relative min-w-0">
        {showSidebar ? (
          <header className="h-16 border-b border-muted bg-brand-800/80 backdrop-blur-md flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0 z-10 print:hidden">
            <button
              type="button"
              aria-label={strings.app.ariaOpenMenu}
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-bright rounded-lg shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            {showSearch && onSearchChange ? (
              <div className="min-w-0 relative flex-1 max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={strings.app.searchPlaceholder}
                  className="w-full bg-brand-900 border border-default focus:border-blue-500 rounded-lg pl-10 pr-4 py-2 text-sm outline-none text-foreground transition-all"
                />
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {headerExtra}
              <button
                type="button"
                title="Integrations (Search Console & Analytics 4)"
                aria-label="Open Integrations"
                onClick={openIntegrations}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-brand-700 transition-colors"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <ThemeToggle />
              <ReportSelector />
            </div>
          </header>
        ) : null}

        <IntegrationsModal
          open={integrationsOpen}
          onClose={() => setIntegrationsOpen(false)}
          initialToast={integrationsToast}
        />

        <div className="relative min-h-0 flex-1 overflow-y-auto" id="viewContainer">
          <div className="fade-in">{children}</div>
        </div>
      </main>
    </div>
  );
}

export type { NavItemId };
