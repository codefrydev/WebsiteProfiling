import type { LucideIcon } from 'lucide-react';
import {
  AlertOctagon,
  ArrowLeftRight,
  Link2,
  BarChart2,
  Bug,
  Cpu,
  FileDown,
  FileText,
  FolderTree,
  Gauge,
  Home as HomeIcon,
  Images,
  Key,
  LayoutDashboard,
  Link as LinkIcon,
  Repeat,
  Share2,
  ShieldAlert,
  Terminal,
  TrendingUp,
  FileSearch,
  MessageSquare,
  Globe2,
  Contact2,
} from 'lucide-react';
import { strings } from '@/lib/strings';
import { viewIdToPathSlug, type ViewId } from '@/routes';

export type NavItemId = ViewId | 'pipeline' | 'chat';

export interface AppNavItem {
  id: NavItemId;
  label: string;
  section: string;
  icon: LucideIcon;
  hrefPath: string;
}

const VIEW_NAV: { id: ViewId; icon: LucideIcon }[] = [
  { id: 'home', icon: HomeIcon },
  { id: 'overview', icon: LayoutDashboard },
  { id: 'compare', icon: ArrowLeftRight },
  { id: 'export', icon: FileDown },
  { id: 'log-analyzer', icon: Terminal },
  { id: 'issues', icon: AlertOctagon },
  { id: 'links', icon: LinkIcon },
  { id: 'site-structure', icon: FolderTree },
  { id: 'redirects', icon: Repeat },
  { id: 'content', icon: FileText },
  { id: 'lighthouse', icon: Gauge },
  { id: 'security', icon: ShieldAlert },
  { id: 'javascript-errors', icon: Bug },
  { id: 'content-analytics', icon: BarChart2 },
  { id: 'tech-stack', icon: Cpu },
  { id: 'network', icon: Share2 },
  { id: 'gallery', icon: Images },
  { id: 'search-performance', icon: TrendingUp },
  { id: 'indexation', icon: FileSearch },
  { id: 'subdomains', icon: Globe2 },
  { id: 'contacts', icon: Contact2 },
  { id: 'backlinks', icon: Link2 },
  { id: 'traffic', icon: BarChart2 },
  { id: 'keywords-explorer', icon: Key },
];

const PIPELINE_NAV: AppNavItem = {
  id: 'pipeline',
  label: strings.nav.pipeline.label,
  section: strings.nav.pipeline.section,
  icon: Terminal,
  hrefPath: '/pipeline',
};

const CHAT_NAV: AppNavItem = {
  id: 'chat',
  label: strings.nav.chat.label,
  section: strings.nav.chat.section,
  icon: MessageSquare,
  hrefPath: '/chat',
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  ...VIEW_NAV.map(({ id, icon }) => ({
    id,
    icon,
    label: strings.nav[id].label,
    section: strings.nav[id].section,
    hrefPath: id === 'home' ? '/home' : `/${viewIdToPathSlug(id)}`,
  })),
  PIPELINE_NAV,
  CHAT_NAV,
];

export const APP_NAV_SECTIONS = [...new Set(APP_NAV_ITEMS.map((item) => item.section))];

export function navHref(item: AppNavItem, trailingQuery: string): string {
  if (item.id === 'home' || item.id === 'pipeline' || item.id === 'chat') {
    return item.hrefPath;
  }
  return trailingQuery ? `${item.hrefPath}${trailingQuery}` : item.hrefPath;
}

export function isNavItemActive(item: AppNavItem, pathname: string): boolean {
  if (item.id === 'pipeline') {
    return pathname === '/pipeline' || pathname.startsWith('/pipeline/');
  }
  if (item.id === 'chat') {
    return pathname === '/chat' || pathname.startsWith('/chat/');
  }
  if (item.id === 'home') {
    return pathname === '/home';
  }
  return pathname === item.hrefPath;
}
