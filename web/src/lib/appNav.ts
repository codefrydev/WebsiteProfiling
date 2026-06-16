import type { LucideIcon } from 'lucide-react';
import {
  AlertOctagon,
  ArrowLeftRight,
  Link2,
  BarChart2,
  Bug,
  Accessibility,
  Image,
  Cpu,
  FileDown,
  FileText,
  TextSearch,
  FolderTree,
  Gauge,
  Home as HomeIcon,
  Images,
  Key,
  PenLine,
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

export type NavItemId = ViewId | 'pipeline' | 'chat' | 'write';

export interface AppNavItem {
  id: NavItemId;
  label: string;
  section: string;
  icon: LucideIcon;
  hrefPath: string;
  /** Short one-line description shown under the label in the sidebar. */
  description?: string;
}

/**
 * One-line descriptions for nav items. Kept in TS (not strings.json) because
 * `strings.nav[id]` is typed across the union of all nav keys, so adding a
 * `description` to only some entries would not type-check.
 */
const NAV_DESCRIPTIONS: Partial<Record<NavItemId, string>> = {
  home: 'Pick a property to audit',
  overview: 'Audit health at a glance',
  compare: 'Compare two audit runs',
  export: 'Download reports & data',
  'log-analyzer': 'Server log file insights',
  issues: 'Problems found, by severity',
  links: 'Every crawled URL & status',
  'site-structure': 'Folder depth & hierarchy',
  redirects: 'Redirect chains & status codes',
  content: 'Titles, meta & headings',
  lighthouse: 'Core Web Vitals & scores',
  security: 'TLS, headers & findings',
  'javascript-errors': 'Console & runtime errors',
  accessibility: 'WCAG issues from axe',
  'image-seo': 'Alt text & image weight',
  'geo-readiness': 'AI answer-engine readiness',
  'content-analytics': 'Content quality signals',
  'text-content-analysis': 'Readability & keyword use',
  'tech-stack': 'Detected frameworks & tools',
  network: 'Internal link relationships',
  gallery: 'Page preview screenshots',
  'search-performance': 'Clicks, impressions & queries',
  indexation: 'Index coverage & canonicals',
  subdomains: 'Discovered subdomains',
  contacts: 'Emails & contact details',
  backlinks: 'External sites linking in',
  traffic: 'GA4 sessions & users',
  'keywords-explorer': 'Keyword research & expansion',
  pipeline: 'Crawl a site and build a report',
  chat: 'Ask questions about this audit',
  write: 'Draft content from audit data',
};

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
  { id: 'accessibility', icon: Accessibility },
  { id: 'image-seo', icon: Image },
  { id: 'geo-readiness', icon: Globe2 },
  { id: 'content-analytics', icon: BarChart2 },
  { id: 'text-content-analysis', icon: TextSearch },
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
  description: NAV_DESCRIPTIONS.pipeline,
};

const CHAT_NAV: AppNavItem = {
  id: 'chat',
  label: strings.nav.chat.label,
  section: strings.nav.chat.section,
  icon: MessageSquare,
  hrefPath: '/chat',
  description: NAV_DESCRIPTIONS.chat,
};

const WRITE_NAV: AppNavItem = {
  id: 'write',
  label: strings.nav.write.label,
  section: strings.nav.write.section,
  icon: PenLine,
  hrefPath: '/write',
  description: NAV_DESCRIPTIONS.write,
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  ...VIEW_NAV.map(({ id, icon }) => ({
    id,
    icon,
    label: strings.nav[id].label,
    section: strings.nav[id].section,
    hrefPath: id === 'home' ? '/home' : `/${viewIdToPathSlug(id)}`,
    description: NAV_DESCRIPTIONS[id],
  })),
  PIPELINE_NAV,
  WRITE_NAV,
  CHAT_NAV,
];

export const APP_NAV_SECTIONS = [...new Set(APP_NAV_ITEMS.map((item) => item.section))];

export function navHref(item: AppNavItem, trailingQuery: string): string {
  if (item.id === 'home' || item.id === 'pipeline' || item.id === 'chat' || item.id === 'write') {
    return item.hrefPath;
  }
  const raw = trailingQuery.startsWith('?') ? trailingQuery.slice(1) : trailingQuery;
  const params = new URLSearchParams(raw);
  const preserved = new URLSearchParams();
  const domain = params.get('domain');
  const brand = params.get('brand');
  if (domain) preserved.set('domain', domain);
  if (brand) preserved.set('brand', brand);
  const q = preserved.toString();
  return q ? `${item.hrefPath}?${q}` : item.hrefPath;
}

export function isNavItemActive(item: AppNavItem, pathname: string): boolean {
  if (item.id === 'pipeline') {
    return pathname === '/pipeline' || pathname.startsWith('/pipeline/');
  }
  if (item.id === 'chat') {
    return pathname === '/chat' || pathname.startsWith('/chat/');
  }
  if (item.id === 'write') {
    return pathname === '/write' || pathname.startsWith('/write/');
  }
  if (item.id === 'home') {
    return pathname === '/home';
  }
  return pathname === item.hrefPath;
}
