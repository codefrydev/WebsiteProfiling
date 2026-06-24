import { Suspense, useState, useEffect, type ComponentType, type ReactNode, lazy } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Home as HomeIcon,
  LayoutDashboard,
  LayoutGrid,
  AlertOctagon,
  Link as LinkIcon,
  Repeat,
  FileText,
  ShieldAlert,
  Bug,
  Accessibility,
  Image,
  Gauge,
  Share2,
  BarChart2,
  Cpu,
  Images,
  FolderTree,
  TrendingUp,
  Link2,
  Key,
  ArrowLeftRight,
  FileDown,
  FileSearch,
  Terminal,
  Globe2,
  Contact2,
  TextSearch,
} from 'lucide-react';
import { UrlInspectorProvider } from './context/UrlInspectorContext';
import AppShell from './components/AppShell';
import { useReport } from './context/useReport';
import { strings } from './lib/strings';
import { canonicalDomainFromPayload, slugifyDomain } from './lib/domainSlug';
import { REPORT_VIEW_IDS } from './lib/appNav';
import { pathSlugToViewId, viewIdToPathSlug, type ViewId } from './routes';
import { dispatchOpenIntegrations } from './lib/pipelineJobEvents';
import ReportShellSkeleton from './components/ReportShellSkeleton';
import ExportReportActions from './components/export/ExportReportActions';
import { ReportProvider as ReportProviderBase } from './context/ReportContext';
import { PortfolioProvider } from './context/PortfolioContext';
import ViewSectionLoader from './components/ViewSectionLoader';
import type { ReportPayload } from '@/types';
function viewLoading(label = 'Loading view…') {
  return (
    <div className="px-[var(--spacing-page-x)] pt-4 pb-6 sm:px-6 lg:px-8 lg:pt-5 lg:pb-8 space-y-4" role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="h-8 w-56 max-w-[70%] animate-pulse rounded-md bg-brand-800/90 dark:bg-white/[0.07]" />
      <div className="h-40 w-full rounded-xl border border-default animate-pulse bg-brand-800/40 dark:bg-white/[0.04]" />
    </div>
  );
}

const Home = lazy(() => import('./views/Home'));
const Overview = lazy(() => import('./views/Overview'));
const Dashboards = lazy(() => import('./views/Dashboards'));
const CompareReports = lazy(() => import('./views/CompareReports'));
const Issues = lazy(() => import('./views/Issues'));
const Links = lazy(() => import('./views/Links'));
const SiteStructure = lazy(() => import('./views/SiteStructure'));
const Redirects = lazy(() => import('./views/Redirects'));
const Content = lazy(() => import('./views/Content'));
const Security = lazy(() => import('./views/Security'));
const JavaScriptErrors = lazy(() => import('./views/JavaScriptErrors'));
const AccessibilityView = lazy(() => import('./views/Accessibility'));
const ImageSeo = lazy(() => import('./views/ImageSeo'));
const GeoReadiness = lazy(() => import('./views/GeoReadiness'));
const Lighthouse = lazy(() => import('./views/Lighthouse'));
const Network = lazy(() => import('./views/Network'));
const ContentAnalytics = lazy(() => import('./views/ContentAnalytics'));
const TextContentAnalysis = lazy(() => import('./views/TextContentAnalysis'));
const TechStack = lazy(() => import('./views/TechStack'));
const Gallery = lazy(() => import('./views/Gallery'));
const SearchPerformance = lazy(() => import('./views/SearchPerformance'));
const Indexation = lazy(() => import('./views/Indexation'));
const Backlinks = lazy(() => import('./views/Backlinks'));
const Traffic = lazy(() => import('./views/Traffic'));
const KeywordsExplorer = lazy(() => import('./views/KeywordsExplorer'));
const ExportReport = lazy(() => import('./views/ExportReport'));
const LogAnalyzer = lazy(() => import('./views/LogAnalyzer'));
const Subdomains = lazy(() => import('./views/Subdomains'));
const Contacts = lazy(() => import('./views/Contacts'));

interface ReportShellReportContext {
  data: ReportPayload | null;
  loading: boolean;
  error: string | null;
  setSelectedReportId: (id: number | null) => void;
  startUrlByRunId: Map<number, string>;
}

interface CurrentViewProps {
  searchQuery: string;
  onNavigate: (id: ViewId | string, opts?: { domain?: string; reportId?: number }) => void;
  onOpenIntegrations: () => void;
}

interface ViewConfigEntry {
  id: ViewId;
  component: ComponentType<CurrentViewProps>;
  icon: ComponentType<{ className?: string }>;
}

interface SlugProps {
  slug: string;
}

const ReportProvider = ReportProviderBase as ComponentType<{
  children: ReactNode;
  domainSlug?: string | null;
}>;

const VIEW_CONFIG: ViewConfigEntry[] = [
  { id: 'home', component: Home as ComponentType<CurrentViewProps>, icon: HomeIcon },
  { id: 'overview', component: Overview as ComponentType<CurrentViewProps>, icon: LayoutDashboard },
  { id: 'dashboards', component: Dashboards as ComponentType<CurrentViewProps>, icon: LayoutGrid },
  { id: 'compare', component: CompareReports as ComponentType<CurrentViewProps>, icon: ArrowLeftRight },
  { id: 'export', component: ExportReport as ComponentType<CurrentViewProps>, icon: FileDown },
  { id: 'log-analyzer', component: LogAnalyzer as ComponentType<CurrentViewProps>, icon: Terminal },
  { id: 'issues', component: Issues as ComponentType<CurrentViewProps>, icon: AlertOctagon },
  { id: 'links', component: Links as ComponentType<CurrentViewProps>, icon: LinkIcon },
  { id: 'site-structure', component: SiteStructure as ComponentType<CurrentViewProps>, icon: FolderTree },
  { id: 'redirects', component: Redirects as ComponentType<CurrentViewProps>, icon: Repeat },
  { id: 'content', component: Content as ComponentType<CurrentViewProps>, icon: FileText },
  { id: 'lighthouse', component: Lighthouse as ComponentType<CurrentViewProps>, icon: Gauge },
  { id: 'security', component: Security as ComponentType<CurrentViewProps>, icon: ShieldAlert },
  { id: 'javascript-errors', component: JavaScriptErrors as ComponentType<CurrentViewProps>, icon: Bug },
  { id: 'accessibility', component: AccessibilityView as ComponentType<CurrentViewProps>, icon: Accessibility },
  { id: 'image-seo', component: ImageSeo as ComponentType<CurrentViewProps>, icon: Image },
  { id: 'geo-readiness', component: GeoReadiness as ComponentType<CurrentViewProps>, icon: Globe2 },
  { id: 'content-analytics', component: ContentAnalytics as ComponentType<CurrentViewProps>, icon: BarChart2 },
  { id: 'text-content-analysis', component: TextContentAnalysis as ComponentType<CurrentViewProps>, icon: TextSearch },
  { id: 'tech-stack', component: TechStack as ComponentType<CurrentViewProps>, icon: Cpu },
  { id: 'network', component: Network as ComponentType<CurrentViewProps>, icon: Share2 },
  { id: 'gallery', component: Gallery as ComponentType<CurrentViewProps>, icon: Images },
  { id: 'search-performance', component: SearchPerformance as ComponentType<CurrentViewProps>, icon: TrendingUp },
  { id: 'indexation', component: Indexation as ComponentType<CurrentViewProps>, icon: FileSearch },
  { id: 'subdomains', component: Subdomains as ComponentType<CurrentViewProps>, icon: Globe2 },
  { id: 'contacts', component: Contacts as ComponentType<CurrentViewProps>, icon: Contact2 },
  { id: 'backlinks', component: Backlinks as ComponentType<CurrentViewProps>, icon: Link2 },
  { id: 'traffic', component: Traffic as ComponentType<CurrentViewProps>, icon: BarChart2 },
  { id: 'keywords-explorer', component: KeywordsExplorer as ComponentType<CurrentViewProps>, icon: Key },
];

if (import.meta.env.DEV) {
  const configIds = new Set(VIEW_CONFIG.map((entry) => entry.id));
  for (const id of REPORT_VIEW_IDS) {
    if (!configIds.has(id)) {
      throw new Error(`ReportShell VIEW_CONFIG missing view id: ${id}`);
    }
  }
  for (const entry of VIEW_CONFIG) {
    if (!REPORT_VIEW_IDS.includes(entry.id)) {
      throw new Error(`ReportShell VIEW_CONFIG has unknown view id: ${entry.id}`);
    }
  }
}

const VIEWS = VIEW_CONFIG.map((v) => ({
  ...v,
  label: strings.nav[v.id].label,
  section: strings.nav[v.id].section,
}));

/** Sync `?domain=` query param with the active report payload. */
function BrandUrlSync({ slug }: SlugProps): null {
  const { data, loading, error, startUrlByRunId } = useReport() as ReportShellReportContext;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const searchStr = searchParams.toString();

  useEffect(() => {
    if (slug !== 'home') return;
    if (!searchParams.get('domain') && !searchParams.get('brand')) return;
    const next = new URLSearchParams(searchStr);
    next.delete('domain');
    next.delete('brand');
    const q = next.toString();
    navigate(q ? `${pathname}?${q}` : pathname, { replace: true });
  }, [slug, searchStr, searchParams, navigate, pathname]);

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
    navigate(q ? `${pathname}?${q}` : pathname, { replace: true });
  }, [slug, loading, error, data, searchStr, searchParams, navigate, pathname, startUrlByRunId]);

  return null;
}

/** Main report shell layout and navigation. */
function AppContent({ slug }: SlugProps): ReactNode {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const { loading, error, data, setSelectedReportId } = useReport() as ReportShellReportContext;

  const view = pathSlugToViewId(slug ?? '');

  const selectView = (id: ViewId | string, opts?: { domain?: string; reportId?: number }): void => {
    if (opts?.reportId != null) {
      setSelectedReportId(opts.reportId);
    }
    const path = `/${viewIdToPathSlug(id)}`;
    if (id === 'home') {
      navigate('/home');
      return;
    }
    if (opts?.domain != null && opts.domain !== '') {
      const p = new URLSearchParams(searchParams.toString());
      p.set('domain', opts.domain);
      const q = p.toString();
      navigate(q ? `${path}?${q}` : path);
      return;
    }
    const q = searchParams.toString();
    navigate(q ? `${path}?${q}` : path);
  };

  if (!view) {
    return null;
  }

  const CurrentView = VIEWS.find((v) => v.id === view)?.component || Home;
  const showSidebar = view !== 'home';
  const showSearch = showSidebar && view !== 'export';

  if (loading && view !== 'home' && !data) {
    return <ReportShellSkeleton variant="dashboard" />;
  }

  if (error && view !== 'home') {
    const isDomainError = error === strings.app.noReportForDomain;
    return (
      <AppShell showSidebar showSearch={false}>
        <div className="flex-1 flex items-center justify-center p-8 min-h-[50vh]">
          <div className="text-center max-w-md">
            <p className="text-red-700 dark:text-red-400 font-medium">
              {isDomainError ? strings.app.noReportForDomainTitle : strings.app.failedTitle}
            </p>
            <p className="text-muted-foreground text-sm mt-2">{error}</p>
            {!isDomainError ? (
              <p className="text-muted-foreground text-sm mt-4">{strings.app.failedHint}</p>
            ) : null}
            <Link
              to="/pipeline"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              {strings.app.openRunAudit}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      showSidebar={showSidebar}
      showSearch={showSearch}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      headerExtra={view === 'export' ? <ExportReportActions /> : undefined}
    >
      {view === 'home' ? (
        <PortfolioProvider>
          <Suspense fallback={viewLoading()}>
            <CurrentView
              searchQuery={searchQuery}
              onNavigate={selectView}
              onOpenIntegrations={dispatchOpenIntegrations}
            />
          </Suspense>
        </PortfolioProvider>
      ) : (
        <Suspense fallback={viewLoading()}>
          <CurrentView
            searchQuery={searchQuery}
            onNavigate={selectView}
            onOpenIntegrations={dispatchOpenIntegrations}
          />
        </Suspense>
      )}
    </AppShell>
  );
}

function RoutedShell({ slug }: SlugProps): ReactNode {
  return (
    <>
      <BrandUrlSync slug={slug} />
      <ViewSectionLoader slug={slug} />
      <AppContent slug={slug} />
    </>
  );
}

/** Wraps children with ReportProvider (db + domain from URL). */
export function ReportAppClient({ children }: { children: ReactNode }): ReactNode {
  const [searchParams] = useSearchParams();
  const domainRaw = searchParams.get('domain') ?? searchParams.get('brand');
  const domainSlug = domainRaw != null && domainRaw !== '' ? domainRaw : null;

  return (
    <ReportProvider domainSlug={domainSlug}>
      <UrlInspectorProvider>
        {children}
      </UrlInspectorProvider>
    </ReportProvider>
  );
}

export default function ReportShell({ slug }: SlugProps): ReactNode {
  return <RoutedShell slug={slug} />;
}
