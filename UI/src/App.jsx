import { useState } from 'react';
import {
  Radar,
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
  Download,
  BarChart2,
  Cpu,
  Menu,
  X,
  Github,
  Globe,
  TrendingUp,
  BarChart3,
  Swords,
  BookOpen,
  LineChart,
  MessageSquare,
  Megaphone,
  MapPin,
  Folders,
  FileBarChart,
  Bell,
  Settings2,
  Bot,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { ReportProvider } from './context/ReportContext.jsx';
import { ApiProvider, useApi } from './context/ApiContext.jsx';
import { useReport } from './context/useReport';
import { Button, Badge, ReportSelector } from './components';

// Existing SQLite-based views
import Overview from './views/Overview';
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

// New API-based views
import SiteExplorer from './views/SiteExplorer';
import KeywordsExplorer from './views/KeywordsExplorer';
import RankTracker from './views/RankTracker';
import GscInsights from './views/GscInsights';
import CompetitiveIntel from './views/CompetitiveIntel';
import ContentExplorer from './views/ContentExplorer';
import BrandRadar from './views/BrandRadar';
import AiAssistant from './views/AiAssistant';
import WebAnalytics from './views/WebAnalytics';
import SocialMediaManager from './views/SocialMediaManager';
import Advertising from './views/Advertising';
import LocalSeo from './views/LocalSeo';
import Portfolios from './views/Portfolios';
import ReportBuilder from './views/ReportBuilder';
import Alerts from './views/Alerts';
import Settings from './views/Settings';

const VIEWS = [
  // Section: Site Audit (SQLite-based, existing)
  { id: 'overview', label: 'Dashboard', component: Overview, section: 'Site Audit', icon: LayoutDashboard },
  { id: 'issues', label: 'Issues', component: Issues, section: 'Site Audit', icon: AlertOctagon },
  { id: 'links', label: 'Link Explorer', component: Links, section: 'Site Audit', icon: LinkIcon },
  { id: 'redirects', label: 'Redirects', component: Redirects, section: 'Site Audit', icon: Repeat },
  { id: 'content', label: 'On-Page SEO', component: Content, section: 'Site Audit', icon: FileText },
  { id: 'lighthouse', label: 'Page Speed', component: Lighthouse, section: 'Site Audit', icon: Gauge },
  { id: 'security', label: 'Security', component: Security, section: 'Site Audit', icon: ShieldAlert },
  { id: 'content-analytics', label: 'Content Insights', component: ContentAnalytics, section: 'Site Audit', icon: BarChart2 },
  { id: 'tech-stack', label: 'Tech Stack', component: TechStack, section: 'Site Audit', icon: Cpu },
  { id: 'charts', label: 'Crawl Charts', component: Charts, section: 'Site Audit', icon: PieChart },
  { id: 'network', label: 'Link Graph', component: Network, section: 'Site Audit', icon: Share2 },

  // Section: Research (API-based)
  { id: 'site-explorer', label: 'Site Explorer', component: SiteExplorer, section: 'Research', icon: Globe },
  { id: 'keywords', label: 'Keywords Explorer', component: KeywordsExplorer, section: 'Research', icon: Search },
  { id: 'rank-tracker', label: 'Rank Tracker', component: RankTracker, section: 'Research', icon: TrendingUp },
  { id: 'gsc', label: 'GSC Insights', component: GscInsights, section: 'Research', icon: BarChart3 },
  { id: 'competitive', label: 'Competitive Intel', component: CompetitiveIntel, section: 'Research', icon: Swords },

  // Section: Content (API-based)
  { id: 'content-tools', label: 'Content Tools', component: ContentExplorer, section: 'Content', icon: BookOpen },
  { id: 'brand-radar', label: 'Brand Radar', component: BrandRadar, section: 'Content', icon: Radar },
  { id: 'ai', label: 'AI Assistant', component: AiAssistant, section: 'Content', icon: Bot },

  // Section: Analytics
  { id: 'analytics', label: 'Web Analytics', component: WebAnalytics, section: 'Analytics', icon: LineChart },

  // Section: Marketing
  { id: 'social', label: 'Social Media', component: SocialMediaManager, section: 'Marketing', icon: MessageSquare },
  { id: 'ads', label: 'Advertising', component: Advertising, section: 'Marketing', icon: Megaphone },
  { id: 'local-seo', label: 'Local SEO', component: LocalSeo, section: 'Marketing', icon: MapPin },

  // Section: Reporting
  { id: 'portfolios', label: 'Portfolios', component: Portfolios, section: 'Reporting', icon: Folders },
  { id: 'reports', label: 'Report Builder', component: ReportBuilder, section: 'Reporting', icon: FileBarChart },
  { id: 'alerts', label: 'Alerts', component: Alerts, section: 'Reporting', icon: Bell },

  // Section: Settings
  { id: 'settings', label: 'Settings', component: Settings, section: 'Settings', icon: Settings2 },
];

// Views that use the API (not SQLite)
const API_VIEWS = new Set([
  'site-explorer', 'keywords', 'rank-tracker', 'gsc', 'competitive',
  'content-tools', 'brand-radar', 'ai',
  'analytics', 'social', 'ads', 'local-seo',
  'portfolios', 'reports', 'alerts', 'settings',
]);

function ProjectSelector() {
  const { projects, currentProject, selectProject, createProject, isConnected } = useApi();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');

  if (!isConnected) return null;

  const startCreate = async (e) => {
    e?.preventDefault?.();
    const name = newName.trim() || 'My site';
    const domain = newDomain.trim() || undefined;
    setCreating(true);
    try {
      await createProject({ name, domain });
      setNewName('');
      setNewDomain('');
      setOpen(false);
    } catch (err) {
      console.warn('Create project failed:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-800 border border-muted text-sm text-slate-300 hover:border-blue-500/40 transition-all"
      >
        <FolderOpen className="h-4 w-4 text-blue-400" />
        <span className="max-w-[120px] truncate">
          {projects.length === 0 ? 'Create project' : (currentProject?.name || 'Select project')}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 w-64 bg-brand-800 border border-muted rounded-xl shadow-xl z-50 py-1 overflow-hidden">
            <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-muted">Projects</div>
            {projects.length === 0 ? (
              <form onSubmit={startCreate} className="p-3 space-y-2">
                <p className="text-xs text-slate-500">Create a project so API-backed views can load data.</p>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Project name"
                  className="w-full bg-brand-900 border border-default rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500"
                />
                <input
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="Domain (optional)"
                  className="w-full bg-brand-900 border border-default rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? 'Creating…' : 'Create project'}
                </button>
              </form>
            ) : (
              <>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { selectProject(p); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      currentProject?.id === p.id
                        ? 'text-blue-400 bg-blue-500/10'
                        : 'text-slate-300 hover:bg-brand-700'
                    }`}
                  >
                    {p.name}
                    {p.domain && <span className="block text-xs text-slate-500">{p.domain}</span>}
                  </button>
                ))}
                <div className="border-t border-muted p-2">
                  <form onSubmit={startCreate} className="space-y-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="New project name"
                      className="w-full bg-brand-900 border border-default rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                    />
                    <input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="Domain (optional)"
                      className="w-full bg-brand-900 border border-default rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={creating || !newName.trim()}
                      className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-muted text-xs text-slate-300 hover:bg-brand-700 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add project
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BackendBanner() {
  const { isConnected, loading } = useApi();
  const [dismissed, setDismissed] = useState(false);

  if (loading || isConnected || dismissed) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-3 text-sm shrink-0">
      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
      <span className="text-amber-300 flex-1">
        Backend not connected. Some features require the FastAPI backend.
        <code className="ml-2 px-2 py-0.5 bg-brand-900 rounded text-xs font-mono text-green-400">
          uvicorn backend.app.main:app --reload
        </code>
      </span>
      <button onClick={() => setDismissed(true)} className="text-amber-600 hover:text-amber-400 shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function AppContent() {
  const [view, setView] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data, loading, error } = useReport();
  const { isConnected } = useApi();

  const closeSidebar = () => setSidebarOpen(false);
  const selectView = (id) => { setView(id); closeSidebar(); };

  const CurrentView = VIEWS.find((v) => v.id === view)?.component || Overview;
  const issueCount = data?.categories?.reduce((n, c) => n + (c.issues?.length || 0), 0) ?? 0;
  const securityCount = data?.security_findings?.length ?? 0;

  const handleExportData = () => {
    const links = data?.links || [];
    const keys = ['url', 'status', 'inlinks', 'title', 'content_length', 'depth'];
    const rows = [keys.join(',')];
    links.forEach((l) => {
      rows.push(keys.map((k) => {
        const v = l[k];
        if (v == null) return '';
        const s = String(v);
        if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data?.site_name || 'crawl') + '-links.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const isApiView = API_VIEWS.has(view);
  const siteName = data?.site_name || 'WebsiteProfiling';
  const initials = siteName.charAt(0).toUpperCase();
  const crawlSummary = data?.summary;
  const lastCrawlText = crawlSummary?.crawl_time_s != null
    ? `Crawled in ${crawlSummary.crawl_time_s}s`
    : 'No crawl loaded';

  const sections = [...new Set(VIEWS.map((v) => v.section))];

  if (!isApiView && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900 text-slate-300">
        <p>Loading report data...</p>
      </div>
    );
  }

  if (!isApiView && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900 text-slate-300 p-8">
        <div className="text-center max-w-md">
          <p className="text-red-400 font-medium">Failed to load report</p>
          <p className="text-slate-500 text-sm mt-2">{error}</p>
          <p className="text-slate-500 text-sm mt-4">Run a crawl first so report.db is created, then copy it to UI/public/report.db.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-brand-900 text-slate-300 overflow-hidden">
      <BackendBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 bg-black/60 z-30 md:hidden print:hidden"
            onClick={closeSidebar}
          />
        )}

        <aside
          className={`fixed md:relative inset-y-0 left-0 w-60 bg-brand-800 border-r border-muted flex flex-col h-screen shrink-0 z-40 shadow-xl print:hidden transition-transform duration-200 ease-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          {/* Logo */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-muted bg-brand-900/30 shrink-0">
            <div className="flex items-center min-w-0 gap-2.5">
              <Radar className="text-blue-500 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-bright leading-tight truncate text-sm">SEO Platform</div>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">WebsiteProfiling</div>
              </div>
            </div>
            <button type="button" aria-label="Close" className="md:hidden p-1 text-slate-400 hover:text-bright" onClick={closeSidebar}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {sections.map((section) => (
              <div key={section}>
                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1 mt-4 px-2 first:mt-2">
                  {section}
                </div>
                {VIEWS.filter((v) => v.section === section).map((v) => {
                  const Icon = v.icon;
                  const isActive = view === v.id;
                  const needsApi = API_VIEWS.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectView(v.id)}
                      className={`nav-btn w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-blue-500/10 border border-blue-500/25 text-blue-400'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 text-left">{v.label}</span>
                      {v.id === 'issues' && issueCount > 0 && (
                        <Badge variant="high" label={String(issueCount)} className="shrink-0 text-[9px]" />
                      )}
                      {v.id === 'security' && securityCount > 0 && (
                        <Badge variant="medium" label={String(securityCount)} className="shrink-0 text-[9px]" />
                      )}
                      {needsApi && !isConnected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" title="Requires backend" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-muted bg-brand-900/30">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
                {initials}
              </div>
              <div className="text-xs min-w-0">
                <div className="text-bright font-bold truncate">{siteName}</div>
                <div className="text-slate-500 text-[10px]">{lastCrawlText}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span className="text-[10px] text-slate-500">{isConnected ? 'Backend connected' : 'Backend offline'}</span>
            </div>
            <a
              href="https://github.com/codefrydev/WebsiteProfiling"
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              <Github className="h-3 w-3 shrink-0" />
              <span>codefrydev/WebsiteProfiling</span>
            </a>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-screen overflow-hidden bg-brand-900 relative min-w-0">
          {/* Top bar */}
          <header className="h-14 border-b border-muted bg-brand-800/80 backdrop-blur-md flex items-center justify-between gap-3 px-4 shrink-0 z-10 print:hidden">
            <button
              type="button"
              aria-label="Open menu"
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-bright rounded-lg shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0 max-w-sm relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search URLs, issues..."
                className="w-full bg-brand-900 border border-default focus:border-blue-500 rounded-lg pl-9 pr-4 py-1.5 text-sm outline-none text-slate-200 transition-all"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ProjectSelector />
              <ReportSelector />
              <Button variant="primary" onClick={handleExportData} className="text-xs py-1.5">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1">Export</span>
              </Button>
            </div>
          </header>

          {/* View content */}
          <div className="flex-1 overflow-y-auto relative" id="viewContainer">
            <div className="fade-in">
              <CurrentView searchQuery={searchQuery} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReportProvider dbUrl={`${import.meta.env.BASE_URL}report.db`}>
      <ApiProvider>
        <AppContent />
      </ApiProvider>
    </ReportProvider>
  );
}
