
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Menu,
  Search,
  X,
} from 'lucide-react';
import AppLogo from '@/components/AppLogo';
import IntegrationsModal from '@/components/IntegrationsModal';
import { Badge, ReportSelector } from '@/components';
import { useReport } from '@/context/useReport';
import { useSession } from '@/context/SessionContext';
import { useBranding } from '@/context/useBranding';
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
import { useRiskFeatures } from '@/context/RiskFeaturesContext';
import type { ReportPayload } from '@/types';
import {
  getBrowserDiagnosticsScope,
  getLinksWithBrowserErrors,
} from '@/lib/browserErrors';
import { getCachedClientPreferences, initClientPreferences, patchClientPreferences } from '@/lib/clientPreferences';

interface IntegrationsToast {
  type: 'success' | 'error';
  message: string;
}

interface ReportCategoryWithIssues {
  issues?: unknown[];
}

const SIDEBAR_COLLAPSED_KEY = 'app-sidebar-collapsed';

function navItemBadgeCount(
  itemId: NavItemId,
  issueCount: number,
  securityCount: number,
  jsErrorPageCount: number,
): number {
  if (itemId === 'issues') return issueCount;
  if (itemId === 'security') return securityCount;
  if (itemId === 'javascript-errors') return jsErrorPageCount;
  return 0;
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => getCachedClientPreferences().sidebarCollapsed,
  );
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [integrationsToast, setIntegrationsToast] = useState<IntegrationsToast | null>(null);
  const { data, startUrlByRunId } = useReport();
  const { readonly: sessionReadonly } = useSession();
  const { productName, productSubtitle } = useBranding();
  const { featureEnabled } = useRiskFeatures();

  const trailing = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const closeSidebar = () => setSidebarOpen(false);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore storage errors */
      }
      patchClientPreferences({ sidebarCollapsed: next });
      return next;
    });
  };

  useEffect(() => {
    void initClientPreferences().then((prefs) => {
      setSidebarCollapsed(prefs.sidebarCollapsed);
    });
  }, []);

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
      navigate(q ? `${pathname}?${q}` : pathname, { replace: true });
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
          className={`inset-y-0 left-0 w-64 bg-brand-800 border-r border-muted flex flex-col h-screen shrink-0 z-40 shadow-xl print:hidden transition-[width,transform] duration-200 ease-out fixed md:relative ${
            sidebarCollapsed ? 'md:w-14' : 'md:w-64'
          } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        >
          <div
            className={`flex shrink-0 items-center border-b border-muted bg-brand-900/30 ${
              sidebarCollapsed
                ? 'h-16 justify-between px-6 md:h-auto md:flex-col md:justify-center md:gap-2 md:px-0 md:py-3'
                : 'h-16 justify-between px-6'
            }`}
          >
            <Link
              to="/home"
              className={`flex items-center min-w-0 ${sidebarCollapsed ? 'md:justify-center' : ''}`}
              onClick={closeSidebar}
              title={sidebarCollapsed ? productName : undefined}
            >
              <AppLogo className={sidebarCollapsed ? 'md:mr-0 mr-3' : 'mr-3'} />
              <div className={`min-w-0 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                <div className="font-bold text-bright leading-tight truncate">
                  {productName}
                </div>
                <div className="text-[11px] text-muted-foreground">{productSubtitle}</div>
              </div>
            </Link>
            <button
              type="button"
              aria-label={strings.app.ariaCloseMenu}
              className="md:hidden p-2 -mr-2 text-muted-foreground hover:text-bright rounded-lg shrink-0"
              onClick={closeSidebar}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav
            className={`flex-1 overflow-y-auto space-y-1 ${
              sidebarCollapsed ? 'p-4 md:px-2 md:py-3' : 'p-4'
            }`}
          >
            {APP_NAV_SECTIONS.map((section) => (
              <div key={section}>
                <div
                  className={`text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-4 px-2 first:mt-0 ${
                    sidebarCollapsed ? 'md:hidden' : ''
                  }`}
                >
                  {section}
                </div>
                {APP_NAV_ITEMS.filter((item) => item.section === section && featureEnabled(item.id)).map((item) => {
                  const Icon = item.icon;
                  const href = navHref(item, trailing);
                  const isActive = isNavItemActive(item, pathname);
                  const badgeCount = navItemBadgeCount(
                    item.id,
                    issueCount,
                    securityCount,
                    jsErrorPageCount,
                  );
                  return (
                    <Link
                      key={item.id}
                      to={href}
                      onClick={closeSidebar}
                      title={
                        sidebarCollapsed
                          ? item.description
                            ? `${item.label} — ${item.description}`
                            : item.label
                          : undefined
                      }
                      aria-label={sidebarCollapsed ? item.label : undefined}
                      className={`nav-btn press relative w-full flex items-center rounded-lg text-sm font-medium transition-all ${
                        sidebarCollapsed
                          ? 'gap-3 px-3 py-2.5 md:justify-center md:gap-0 md:px-0 md:py-2.5'
                          : 'gap-3 px-3 py-2'
                      } ${
                        isActive
                          ? 'tab-active text-link'
                          : 'text-muted-foreground hover:text-foreground hover:bg-brand-700/80'
                      }`}
                    >
                      {isActive ? (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-link"
                        />
                      ) : null}
                      <Icon className="h-4 w-4 shrink-0" />
                      <span
                        className={`flex min-w-0 flex-1 flex-col text-left ${sidebarCollapsed ? 'md:hidden' : ''}`}
                      >
                        <span className="truncate leading-tight">{item.label}</span>
                        {item.description ? (
                          <span
                            className={`truncate text-[11px] font-normal leading-tight ${
                              isActive ? 'text-link/70' : 'text-muted-foreground'
                            }`}
                          >
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {badgeCount > 0 && !sidebarCollapsed ? (
                        <Badge
                          variant={item.id === 'security' ? 'medium' : 'high'}
                          label={String(badgeCount)}
                          className="shrink-0"
                          live
                        />
                      ) : null}
                      {badgeCount > 0 && sidebarCollapsed ? (
                        <span
                          className="absolute top-1.5 right-1.5 hidden md:block h-2 w-2 rounded-full bg-[var(--color-danger)]"
                          aria-hidden
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div
            className={`border-t border-muted bg-brand-900/30 ${
              sidebarCollapsed ? 'p-4 md:p-2' : 'p-4'
            }`}
          >
            <div
              className={`flex items-center ${sidebarCollapsed ? 'gap-3 md:justify-center md:gap-0' : 'gap-3'}`}
            >
              <div
                className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white text-xs shrink-0"
                title={sidebarCollapsed ? auditedHost : undefined}
              >
                {auditedInitials}
              </div>
              <div className={`text-xs min-w-0 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                <div className="text-bright font-bold truncate">{auditedHost}</div>
                <div className="text-muted-foreground">{lastCrawlText}</div>
              </div>
            </div>
            {auditedStartUrl ? (
              sidebarCollapsed ? (
                <a
                  href={auditedStartUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={strings.app.viewSiteLabel}
                  aria-label={strings.app.viewSiteLabel}
                  className="mt-3 hidden md:flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              ) : (
                <a
                  href={auditedStartUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span>{strings.app.viewSiteLabel}</span>
                </a>
              )
            ) : null}
          </div>
        </aside>
      ) : null}

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-brand-900 relative min-w-0">
        {sessionReadonly ? (
          <div
            role="status"
            className="shrink-0 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-2 text-center text-xs text-[var(--color-warning)] print:hidden"
          >
            {strings.app.readonlyBanner}
          </div>
        ) : null}
        {showSidebar ? (
          <header className="h-16 border-b border-muted bg-brand-800/80 backdrop-blur-md shadow-[var(--elevation-1)] flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0 z-10 print:hidden">
            <div className="flex items-center shrink-0">
              <button
                type="button"
                aria-label={strings.app.ariaOpenMenu}
                className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-bright rounded-lg"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label={sidebarCollapsed ? strings.app.sidebarExpand : strings.app.sidebarCollapse}
                className="hidden md:flex p-2 -ml-2 text-muted-foreground hover:text-bright rounded-lg"
                onClick={toggleSidebarCollapsed}
              >
                {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>
            </div>
            {showSearch && onSearchChange ? (
              <div className="min-w-0 relative flex-1 max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={strings.app.searchPlaceholder}
                  className="w-full bg-brand-900 border border-default focus:border-[var(--accent)] rounded-lg pl-10 pr-4 py-2 text-sm outline-none text-foreground transition-all"
                />
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {headerExtra}
              <ReportSelector />
            </div>
          </header>
        ) : null}

        <IntegrationsModal
          open={integrationsOpen}
          onClose={() => setIntegrationsOpen(false)}
          initialToast={integrationsToast}
        />

        <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden" id="viewContainer">
          <div className="fade-in min-w-0 max-w-full">{children}</div>
        </div>
      </main>
    </div>
  );
}

export type { NavItemId };
