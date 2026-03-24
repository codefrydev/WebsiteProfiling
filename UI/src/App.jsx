import { useState } from 'react';
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
  Github,
  Images,
  Sparkles,
  Database,
} from 'lucide-react';
import { ReportProvider } from './context/ReportContext.jsx';
import { BrowserAssistantProvider } from './context/BrowserAssistantContext.jsx';
import { ThemeProvider } from './context/ThemeProvider.jsx';
import { useReport } from './context/useReport';
import { strings, format } from './lib/strings';
import { Badge, ReportSelector } from './components';
import ThemeToggle from './components/ThemeToggle.jsx';
import Overview from './views/Overview';
import Home from './views/Home';
import Issues from './views/Issues';
import Links from './views/Links';
import Redirects from './views/Redirects';
import Content from './views/Content';
import Security from './views/Security';
import Lighthouse from './views/Lighthouse';
import Charts from './views/Charts';
import Network from './views/Network';
import ContentAnalytics from './views/ContentAnalytics';
import TechStack from './views/TechStack';
import Gallery from './views/Gallery';
import ModelLoader from './views/ModelLoader.jsx';
import SqlPlayground from './views/SqlPlayground.jsx';
import BrowserMlChat from './components/ml/BrowserMlChat.jsx';

const VIEW_CONFIG = [
  { id: 'home', component: Home, icon: HomeIcon },
  { id: 'overview', component: Overview, icon: LayoutDashboard },
  { id: 'model-loader', component: ModelLoader, icon: Sparkles },
  { id: 'sql-playground', component: SqlPlayground, icon: Database },
  { id: 'issues', component: Issues, icon: AlertOctagon },
  { id: 'links', component: Links, icon: LinkIcon },
  { id: 'redirects', component: Redirects, icon: Repeat },
  { id: 'content', component: Content, icon: FileText },
  { id: 'lighthouse', component: Lighthouse, icon: Gauge },
  { id: 'security', component: Security, icon: ShieldAlert },
  { id: 'content-analytics', component: ContentAnalytics, icon: BarChart2 },
  { id: 'tech-stack', component: TechStack, icon: Cpu },
  { id: 'charts', component: Charts, icon: PieChart },
  { id: 'network', component: Network, icon: Share2 },
  { id: 'gallery', component: Gallery, icon: Images },
];

const VIEWS = VIEW_CONFIG.map((v) => ({
  ...v,
  label: strings.nav[v.id].label,
  section: strings.nav[v.id].section,
}));

function AppContent() {
  const [view, setView] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data, loading, error } = useReport();

  const closeSidebar = () => setSidebarOpen(false);
  const selectView = (id) => {
    setView(id);
    closeSidebar();
  };

  const CurrentView = VIEWS.find((v) => v.id === view)?.component || Home;
  const isLabView = view === 'model-loader' || view === 'sql-playground';
  const isHomeView = view === 'home';
  const showSidebar = !isHomeView;
  const issueCount = data?.categories?.reduce((n, c) => n + (c.issues?.length || 0), 0) ?? 0;
  const securityCount = data?.security_findings?.length ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground">
        <p>{strings.app.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground p-8">
        <div className="text-center max-w-md">
          <p className="text-red-400 font-medium">{strings.app.failedTitle}</p>
          <p className="text-muted-foreground text-sm mt-2">{error}</p>
          <p className="text-muted-foreground text-sm mt-4">{strings.app.failedHint}</p>
        </div>
      </div>
    );
  }

  const siteName = data?.site_name || strings.app.defaultSiteName;
  const initials = siteName.charAt(0).toUpperCase();
  const crawlSummary = data?.summary;
  const lastCrawlText = crawlSummary?.crawl_time_s != null
    ? format(strings.app.crawlCompletedSeconds, { seconds: crawlSummary.crawl_time_s })
    : strings.app.crawlCompleted;

  const sections = [...new Set(VIEWS.map((v) => v.section))];

  return (
    <div className={`min-h-screen bg-brand-900 text-foreground overflow-hidden ${showSidebar ? 'flex' : 'block'}`}>
      {/* Overlay when sidebar open (full-screen lab views; mobile-only on other views) */}
      {showSidebar && sidebarOpen && (
        <button
          type="button"
          aria-label={strings.app.ariaCloseMenu}
          className={`fixed inset-0 z-30 print:hidden bg-[color:var(--app-overlay)] ${
            isLabView ? '' : 'md:hidden'
          }`}
          onClick={closeSidebar}
        />
      )}

      {showSidebar && <aside
        className={`inset-y-0 left-0 w-64 bg-brand-800 border-r border-muted flex flex-col h-screen shrink-0 z-40 shadow-xl print:hidden transition-transform duration-200 ease-out ${
          isLabView
            ? `fixed ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `fixed md:relative ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-muted bg-brand-900/30 shrink-0">
          <div className="flex items-center min-w-0">
            <Radar className="text-blue-500 mr-3 h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-bright leading-tight truncate">{siteName}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{strings.app.productSubtitle}</div>
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
                const isActive = view === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectView(v.id)}
                    className={`nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'tab-active bg-blue-500/10 border border-blue-500/25 text-blue-400'
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
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-muted bg-brand-900/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
              {initials}
            </div>
            <div className="text-xs min-w-0">
              <div className="text-bright font-bold truncate">{siteName}</div>
              <div className="text-muted-foreground">{lastCrawlText}</div>
            </div>
          </div>
          <a
            href="https://github.com/codefrydev/WebsiteProfiling"
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5 shrink-0" />
            <span>{strings.app.githubLinkLabel}</span>
          </a>
        </div>
      </aside>}

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-brand-900 relative min-w-0">
        {showSidebar && isLabView ? (
          <button
            type="button"
            aria-label={strings.app.ariaOpenMenu}
            className="fixed left-3 top-3 z-20 flex items-center justify-center rounded-xl border border-default bg-brand-800/95 p-2.5 text-muted-foreground shadow-lg backdrop-blur-sm print:hidden hover:bg-brand-700/90 hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 shrink-0" />
          </button>
        ) : null}
        <header
          className={`h-16 border-b border-muted bg-brand-800/80 backdrop-blur-md flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0 z-10 print:hidden ${
            isLabView || isHomeView ? 'hidden' : ''
          }`}
        >
          {showSidebar ? (
            <button
              type="button"
              aria-label={strings.app.ariaOpenMenu}
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-bright rounded-lg shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
          ) : null}
          <div className={`min-w-0 relative ${showSidebar ? 'flex-1 max-w-xl' : 'flex-1 max-w-2xl mx-auto'}`}>
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
            <ThemeToggle />
            <ReportSelector />
          </div>
        </header>

        <div
          className={`relative min-h-0 flex-1 ${isLabView ? 'flex flex-col overflow-hidden pt-12' : 'overflow-y-auto'}`}
          id="viewContainer"
        >
          <div className={`fade-in ${isLabView ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
            <CurrentView searchQuery={searchQuery} onNavigate={selectView} />
          </div>
        </div>
        {!isLabView && !isHomeView ? <BrowserMlChat /> : null}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ReportProvider dbUrl={`${import.meta.env.BASE_URL}report.db`}>
        <BrowserAssistantProvider>
          <AppContent />
        </BrowserAssistantProvider>
      </ReportProvider>
    </ThemeProvider>
  );
}
