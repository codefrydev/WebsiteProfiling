'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Radar,
  Home as HomeIcon,
  LayoutDashboard,
  AlertOctagon,
  Link as LinkIcon,
  Repeat,
  FileText,
  ShieldAlert,
  Gauge,
  PieChart,
  Share2,
  Search,
  BarChart2,
  Cpu,
  Menu,
  X,
  ExternalLink,
  Images,
  FolderTree,
  Settings2,
  TrendingUp,
  Key,
} from 'lucide-react';
import IntegrationsModal from './components/IntegrationsModal.jsx';
import { ReportProvider } from './context/ReportContext.jsx';
import { useReport } from './context/useReport';
import { strings, format } from './lib/strings';
import { canonicalDomainFromPayload, slugifyDomain } from './lib/domainSlug';
import { pathSlugToViewId, viewIdToPathSlug } from './routes.js';
import { Badge, ReportSelector } from './components';
import PipelineRunnerFab from './components/PipelineRunnerFab.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import ReportShellSkeleton from './components/ReportShellSkeleton.jsx';
import Overview from './views/Overview';
import Home from './views/Home';
import Issues from './views/Issues';
import Links from './views/Links';
import SiteStructure from './views/SiteStructure';
import Redirects from './views/Redirects';
import Content from './views/Content';
import Security from './views/Security';
import Lighthouse from './views/Lighthouse';
import Charts from './views/Charts';
const Network = dynamic(() => import('./views/Network'), {
  ssr: false,
  loading: () => (
    <div className="p-6 sm:p-8 space-y-4" role="status" aria-busy="true" aria-label="Loading network graph">
      <span className="sr-only">Loading network graph…</span>
      <div className="h-7 w-48 max-w-[70%] animate-pulse rounded-md bg-brand-800/90 dark:bg-white/[0.07]" />
      <div className="h-[min(420px,55vh)] w-full rounded-xl border border-default animate-pulse bg-brand-800/40 dark:bg-white/[0.04]" />
    </div>
  ),
});
import ContentAnalytics from './views/ContentAnalytics';
import TechStack from './views/TechStack';
import Gallery from './views/Gallery';
import SearchPerformance from './views/SearchPerformance';
import Traffic from './views/Traffic';
import KeywordsExplorer from './views/KeywordsExplorer';

const VIEW_CONFIG = [
  { id: 'home', component: Home, icon: HomeIcon },
  { id: 'overview', component: Overview, icon: LayoutDashboard },
  { id: 'issues', component: Issues, icon: AlertOctagon },
  { id: 'links', component: Links, icon: LinkIcon },
  { id: 'site-structure', component: SiteStructure, icon: FolderTree },
  { id: 'redirects', component: Redirects, icon: Repeat },
  { id: 'content', component: Content, icon: FileText },
  { id: 'lighthouse', component: Lighthouse, icon: Gauge },
  { id: 'security', component: Security, icon: ShieldAlert },
  { id: 'content-analytics', component: ContentAnalytics, icon: BarChart2 },
  { id: 'tech-stack', component: TechStack, icon: Cpu },
  { id: 'charts', component: Charts, icon: PieChart },
  { id: 'network', component: Network, icon: Share2 },
  { id: 'gallery', component: Gallery, icon: Images },
  { id: 'search-performance', component: SearchPerformance, icon: TrendingUp },
  { id: 'traffic', component: Traffic, icon: BarChart2 },
  { id: 'keywords-explorer', component: KeywordsExplorer, icon: Key },
];

const VIEWS = VIEW_CONFIG.map((v) => ({
  ...v,
  label: strings.nav[v.id].label,
  section: strings.nav[v.id].section,
}));

/** @param {{ slug: string }} props */
function BrandUrlSync({ slug }) {
  const { data, loading, error, startUrlByRunId } = useReport();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchStr = searchParams.toString();

  useEffect(() => {
    if (slug !== 'home') return;
    if (!searchParams.get('domain') && !searchParams.get('brand')) return;
    const next = new URLSearchParams(searchStr);
    next.delete('domain');
    next.delete('brand');
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [slug, searchStr, searchParams, router, pathname]);

  useEffect(() => {
    if (slug === 'home') return;
    if (loading || error || !data) return;
    if (searchParams.get('domain') || searchParams.get('brand')) return;
    const host = canonicalDomainFromPayload(data, startUrlByRunId);
    const fallback = slugifyDomain(data.site_name || '');
    const value = host || fallback;
    if (!value) return;
    const next = new URLSearchParams(searchStr);
    next.set('domain', value);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [slug, loading, error, data, searchStr, searchParams, router, pathname, startUrlByRunId]);

  return null;
}

/** @param {{ slug: string }} props */
function AppContent({ slug }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [integrationsToast, setIntegrationsToast] = useState(null);
  const { data, loading, error, setSelectedReportId, startUrlByRunId } = useReport();

  // Auto-open Integrations modal after OAuth callback (?integrations=open&auth=...)
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
      // Clean up the query params
      const next = new URLSearchParams(searchParams.toString());
      next.delete('integrations');
      next.delete('auth');
      next.delete('reason');
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = pathSlugToViewId(slug ?? '');
  const closeSidebar = () => setSidebarOpen(false);
  const trailing = searchParams.toString() ? `?${searchParams.toString()}` : '';

  useEffect(() => {
    if (!pathSlugToViewId(slug ?? '')) {
      router.replace('/home');
    }
  }, [slug, router]);

  /**
   * @param {string} id - view id
   * @param {{ domain?: string, reportId?: number }} [opts]
   */
  const selectView = (id, opts) => {
    if (opts?.reportId != null) {
      setSelectedReportId(opts.reportId);
    }
    closeSidebar();
    const path = `/${viewIdToPathSlug(id)}`;
    if (id === 'home') {
      router.push('/home');
      return;
    }
    if (opts?.domain != null && opts.domain !== '') {
      const p = new URLSearchParams(searchParams.toString());
      p.set('domain', opts.domain);
      const q = p.toString();
      router.push(q ? `${path}?${q}` : path);
      return;
    }
    const q = searchParams.toString();
    router.push(q ? `${path}?${q}` : path);
  };

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground">
        <p>{strings.app.loading}</p>
      </div>
    );
  }

  const CurrentView = VIEWS.find((v) => v.id === view)?.component || Home;
  const showSidebar = view !== 'home';
  const openIntegrations = () => {
    setIntegrationsToast(null);
    setIntegrationsOpen(true);
  };
  const issueCount = data?.categories?.reduce((n, c) => n + (c.issues?.length || 0), 0) ?? 0;
  const securityCount = data?.security_findings?.length ?? 0;

  if (loading) {
    return <ReportShellSkeleton variant={view === 'home' ? 'home' : 'dashboard'} />;
  }

  if (error) {
    const isDomainError = error === strings.app.noReportForDomain;
    return (
      <div className="min-h-screen bg-brand-900 text-foreground flex flex-col">
        <header className="h-16 border-b border-muted bg-brand-800/80 backdrop-blur-md flex items-center justify-end gap-2 px-4 sm:px-6 shrink-0 print:hidden">
          <button
            type="button"
            title="Integrations (Google Search Console & GA4)"
            aria-label="Open Integrations"
            onClick={openIntegrations}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-brand-700 transition-colors"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <ThemeToggle />
        </header>
        <IntegrationsModal
          open={integrationsOpen}
          onClose={() => setIntegrationsOpen(false)}
          initialToast={integrationsToast}
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <p className="text-red-700 dark:text-red-400 font-medium">
              {isDomainError ? strings.app.noReportForDomainTitle : strings.app.failedTitle}
            </p>
            <p className="text-muted-foreground text-sm mt-2">{error}</p>
            {!isDomainError ? (
              <p className="text-muted-foreground text-sm mt-4">{strings.app.failedHint}</p>
            ) : null}
            <button
              type="button"
              onClick={openIntegrations}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <Settings2 className="h-4 w-4" />
              Set up Google (GSC &amp; GA4)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const auditedHost =
    canonicalDomainFromPayload(data, startUrlByRunId) || strings.app.defaultSiteName;
  const runId = data?.crawl_run_id != null ? Number(data.crawl_run_id) : null;
  const auditedStartUrl =
    (runId != null ? startUrlByRunId?.get(runId) : null) ||
    (auditedHost ? `https://${auditedHost}` : '');
  const auditedInitials = auditedHost.charAt(0).toUpperCase() || 'S';
  const crawlSummary = data?.summary;
  const lastCrawlText =
    crawlSummary?.crawl_time_s != null
      ? format(strings.app.crawlCompletedSeconds, { seconds: crawlSummary.crawl_time_s })
      : strings.app.crawlCompleted;

  const sections = [...new Set(VIEWS.map((v) => v.section))];

  return (
    <div className={`min-h-screen bg-brand-900 text-foreground overflow-hidden ${showSidebar ? 'flex' : 'block'}`}>
      {showSidebar && sidebarOpen && (
        <button
          type="button"
          aria-label={strings.app.ariaCloseMenu}
          className="fixed inset-0 z-30 print:hidden bg-[color:var(--app-overlay)] md:hidden"
          onClick={closeSidebar}
        />
      )}

      {showSidebar && (
        <aside
          className={`inset-y-0 left-0 w-64 bg-brand-800 border-r border-muted flex flex-col h-screen shrink-0 z-40 shadow-xl print:hidden transition-transform duration-200 ease-out fixed md:relative ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="h-16 flex items-center justify-between px-6 border-b border-muted bg-brand-900/30 shrink-0">
            <div className="flex items-center min-w-0">
              <Radar className="text-blue-500 mr-3 h-6 w-6 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-bright leading-tight truncate">
                  {strings.app.productName}
                </div>
                <div className="text-[11px] text-muted-foreground">{strings.app.productSubtitle}</div>
              </div>
            </div>
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
            {sections.map((section) => (
              <div key={section}>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-4 px-2 first:mt-0">
                  {section}
                </div>
                {VIEWS.filter((v) => v.section === section).map((v) => {
                  const Icon = v.icon;
                  const hrefPath = `/${viewIdToPathSlug(v.id)}`;
                  const href = v.id === 'home' ? '/home' : `${hrefPath}${trailing}`;
                  const isActive = v.id === 'home' ? pathname === '/home' : pathname === hrefPath;
                  return (
                    <Link
                      key={v.id}
                      href={href}
                      onClick={closeSidebar}
                      className={`nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'tab-active bg-blue-500/10 border border-blue-500/25 text-link'
                          : 'text-muted-foreground hover:text-foreground hover:bg-brand-700/80'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{v.label}</span>
                      {v.id === 'issues' && issueCount > 0 && (
                        <Badge variant="high" label={String(issueCount)} className="shrink-0" />
                      )}
                      {v.id === 'security' && securityCount > 0 && (
                        <Badge variant="medium" label={String(securityCount)} className="shrink-0" />
                      )}
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
      )}

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-brand-900 relative min-w-0">
        {showSidebar ? (
          <header
            className="h-16 border-b border-muted bg-brand-800/80 backdrop-blur-md flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0 z-10 print:hidden"
          >
            <button
              type="button"
              aria-label={strings.app.ariaOpenMenu}
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-bright rounded-lg shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="min-w-0 relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={strings.app.searchPlaceholder}
                className="w-full bg-brand-900 border border-default focus:border-blue-500 rounded-lg pl-10 pr-4 py-2 text-sm outline-none text-foreground transition-all"
              />
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <button
                type="button"
                title="Integrations (Google Search Console & GA4)"
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
          <div className="fade-in">
            <CurrentView
              searchQuery={searchQuery}
              onNavigate={selectView}
              onOpenIntegrations={openIntegrations}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

/** @param {{ slug: string }} props */
function RoutedShell({ slug }) {
  return (
    <>
      <BrandUrlSync slug={slug} />
      <AppContent slug={slug} />
      <PipelineRunnerFab />
    </>
  );
}

/** @param {{ slug: string }} props */
export default function ReportShell({ slug }) {
  return <RoutedShell slug={slug} />;
}

/** Wraps children with ReportProvider (db + domain from URL). */
export function ReportAppClient({ children }) {
  const searchParams = useSearchParams();
  const domainRaw = searchParams.get('domain') ?? searchParams.get('brand');
  const domainSlug = domainRaw != null && domainRaw !== '' ? domainRaw : null;

  return (
    <ReportProvider domainSlug={domainSlug}>
      {children}
    </ReportProvider>
  );
}
