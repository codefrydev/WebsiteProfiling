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
} from 'lucide-react';
import { ReportProvider } from './context/ReportContext.jsx';
import { useReport } from './context/useReport';
import { Button, Badge, ReportSelector } from './components';
import Overview from './views/Overview';
import Issues from './views/Issues';
import Links from './views/Links';
import Redirects from './views/Redirects';
import Content from './views/Content';
import Security from './views/Security';
import Lighthouse from './views/Lighthouse';
import Charts from './views/Charts';
import Network from './views/Network';

const VIEWS = [
  { id: 'overview', label: 'Executive Summary', component: Overview, section: 'Dashboards', icon: LayoutDashboard },
  { id: 'issues', label: 'Technical Issues', component: Issues, section: 'Dashboards', icon: AlertOctagon },
  { id: 'links', label: 'Link Explorer', component: Links, section: 'Deep Analysis', icon: LinkIcon },
  { id: 'redirects', label: 'Redirects', component: Redirects, section: 'Deep Analysis', icon: Repeat },
  { id: 'content', label: 'On-Page Content', component: Content, section: 'Deep Analysis', icon: FileText },
  { id: 'lighthouse', label: 'Lighthouse', component: Lighthouse, section: 'Deep Analysis', icon: Gauge },
  { id: 'security', label: 'Security & V', component: Security, section: 'Deep Analysis', icon: ShieldAlert },
  { id: 'charts', label: 'Chart.js Analytics', component: Charts, section: 'Data Visualizations', icon: PieChart },
  { id: 'network', label: 'Site Architecture', component: Network, section: 'Data Visualizations', icon: Share2 },
];

function AppContent() {
  const [view, setView] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const { data, loading, error } = useReport();

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
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data?.site_name || 'crawl') + '-links.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900 text-slate-300">
        <p>Loading report data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-900 text-slate-300 p-8">
        <div className="text-center max-w-md">
          <p className="text-red-400 font-medium">Failed to load report</p>
          <p className="text-slate-500 text-sm mt-2">{error}</p>
          <p className="text-slate-500 text-sm mt-4">Run the report from the project root so report.db is copied to UI/public, then refresh. Or copy report.db to UI/public/report.db manually.</p>
        </div>
      </div>
    );
  }

  const siteName = data?.site_name || 'Site';
  const initials = siteName.charAt(0).toUpperCase();
  const crawlSummary = data?.summary;
  const lastCrawlText = crawlSummary?.crawl_time_s != null
    ? `Crawl completed in ${crawlSummary.crawl_time_s}s`
    : 'Crawl completed';

  const sections = [...new Set(VIEWS.map((v) => v.section))];

  return (
    <div className="min-h-screen flex bg-brand-900 text-slate-300 overflow-hidden">
      <aside className="w-64 bg-brand-800 border-r border-slate-800 flex flex-col h-screen shrink-0 z-20 shadow-xl hidden md:flex print:hidden">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-brand-900/30">
          <Radar className="text-blue-500 mr-3 h-6 w-6 shrink-0" />
          <div>
            <div className="font-bold text-white leading-tight">{siteName}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Enterprise Crawler</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {sections.map((section) => (
            <div key={section}>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 mt-4 px-2 first:mt-0">
                {section}
              </div>
              {VIEWS.filter((v) => v.section === section).map((v) => {
                const Icon = v.icon;
                const isActive = view === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setView(v.id)}
                    className={`nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'tab-active bg-blue-500/10 border border-blue-500/30 text-blue-400'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
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
        <div className="p-4 border-t border-slate-800 bg-brand-900/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
              {initials}
            </div>
            <div className="text-xs min-w-0">
              <div className="text-white font-bold truncate">{siteName}</div>
              <div className="text-slate-500">{lastCrawlText}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-brand-900 relative">
        <header className="h-16 border-b border-slate-800 bg-brand-800/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10 print:hidden">
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search URLs, issues..."
              className="w-full bg-brand-900 border border-slate-700 focus:border-blue-500 rounded-lg pl-10 pr-4 py-2 text-sm outline-none text-slate-200 transition-all"
            />
          </div>
          <div className="flex items-center gap-4 ml-4">
            <ReportSelector />
            <Button variant="primary" onClick={handleExportData}>
              <Download className="h-4 w-4" />
              Export Data
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto relative" id="viewContainer">
          <div className="fade-in">
            <CurrentView searchQuery={searchQuery} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ReportProvider dbUrl={`${import.meta.env.BASE_URL}report.db`}>
      <AppContent />
    </ReportProvider>
  );
}
