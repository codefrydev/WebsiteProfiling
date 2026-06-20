import type { LucideIcon } from 'lucide-react';
import {
  AlertOctagon,
  ArrowLeftRight,
  Link2,
  BarChart2,
  BookOpen,
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
  Plug,
  PenLine,
  LayoutDashboard,
  LayoutGrid,
  Link as LinkIcon,
  Repeat,
  Settings as SettingsIcon,
  Share2,
  ShieldAlert,
  Terminal,
  TrendingUp,
  FileSearch,
  MessageSquare,
  Globe2,
  Contact2,
  FileCode,
} from 'lucide-react';
import { strings } from '@/lib/strings';
import { viewIdToPathSlug, type ViewId } from '@/routes';

export type NavItemId = ViewId | 'pipeline' | 'secrets' | 'mcp' | 'docs' | 'chat' | 'write' | 'pages-md' | 'settings';

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
  settings: 'Appearance, color palette & preferences',
  home: 'Pick a property to audit',
  overview: 'Audit health at a glance',
  dashboards: 'Build your own metric dashboards',
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
  secrets: 'API keys and credentials',
  mcp: 'Remote MCP client setup',
  docs: 'Integration setup guides',
  chat: 'Ask questions about this audit',
  write: 'Draft content from audit data',
  'pages-md': 'Extract & preview per-page markdown',
};

const VIEW_NAV: { id: ViewId; icon: LucideIcon }[] = [
  { id: 'home', icon: HomeIcon },
  { id: 'overview', icon: LayoutDashboard },
  { id: 'dashboards', icon: LayoutGrid },
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

const SECRETS_NAV: AppNavItem = {
  id: 'secrets',
  label: strings.nav.secrets.label,
  section: strings.nav.secrets.section,
  icon: Key,
  hrefPath: '/secrets',
  description: NAV_DESCRIPTIONS.secrets,
};

const MCP_NAV: AppNavItem = {
  id: 'mcp',
  label: strings.nav.mcp.label,
  section: strings.nav.mcp.section,
  icon: Plug,
  hrefPath: '/mcp',
  description: NAV_DESCRIPTIONS.mcp,
};

const DOCS_NAV: AppNavItem = {
  id: 'docs',
  label: strings.nav.docs.label,
  section: strings.nav.docs.section,
  icon: BookOpen,
  hrefPath: '/docs',
  description: NAV_DESCRIPTIONS.docs,
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

const PAGES_MD_NAV: AppNavItem = {
  id: 'pages-md',
  label: 'Page Markdown',
  section: 'Tools',
  icon: FileCode,
  hrefPath: '/pages-md',
  description: NAV_DESCRIPTIONS['pages-md'],
};

const SETTINGS_NAV: AppNavItem = {
  id: 'settings',
  label: strings.nav.settings.label,
  section: strings.nav.settings.section,
  icon: SettingsIcon,
  hrefPath: '/settings',
  description: NAV_DESCRIPTIONS.settings,
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
  SECRETS_NAV,
  MCP_NAV,
  DOCS_NAV,
  WRITE_NAV,
  CHAT_NAV,
  PAGES_MD_NAV,
  SETTINGS_NAV,
];

/** View ids rendered inside ReportShell — keep in sync with `VIEW_CONFIG`. */
export const REPORT_VIEW_IDS: ViewId[] = VIEW_NAV.map(({ id }) => id);

export const APP_NAV_SECTIONS = [...new Set(APP_NAV_ITEMS.map((item) => item.section))];

/** Routes with their own app pages — not resolved by `pathSlugToViewId`. */
export const STANDALONE_NAV_IDS = ['pipeline', 'secrets', 'mcp', 'docs', 'chat', 'write', 'pages-md', 'settings'] as const satisfies readonly NavItemId[];

export type StandaloneNavId = (typeof STANDALONE_NAV_IDS)[number];

const STANDALONE_NAV_ID_SET = new Set<string>(STANDALONE_NAV_IDS);

export function isStandaloneNavId(id: NavItemId): id is StandaloneNavId {
  return STANDALONE_NAV_ID_SET.has(id);
}

export interface MiniNavLink {
  id: NavItemId;
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Compact sidebar links shared by chat and write studio shells. */
export function miniNavLinks(ids: readonly NavItemId[]): MiniNavLink[] {
  return ids.map((id) => {
    const item = APP_NAV_ITEMS.find((entry) => entry.id === id);
    if (!item) {
      throw new Error(`Unknown nav item: ${id}`);
    }
    return {
      id: item.id,
      href: item.hrefPath,
      label: item.label,
      icon: item.icon,
    };
  });
}

export const CHAT_SIDEBAR_NAV_IDS = [
  'home',
  'search-performance',
  'links',
  'pipeline',
  'secrets',
  'mcp',
  'docs',
  'write',
  'pages-md',
  'settings',
] as const satisfies readonly NavItemId[];

export const WRITE_SIDEBAR_NAV_IDS = [
  'home',
  'search-performance',
  'links',
  'pipeline',
  'secrets',
  'mcp',
  'docs',
  'chat',
  'write',
  'pages-md',
  'settings',
] as const satisfies readonly NavItemId[];

export const SECRETS_SIDEBAR_NAV_IDS = WRITE_SIDEBAR_NAV_IDS;

export const PIPELINE_SIDEBAR_NAV_IDS = WRITE_SIDEBAR_NAV_IDS;

export const DOCS_SIDEBAR_NAV_IDS = WRITE_SIDEBAR_NAV_IDS;

export const PAGES_MD_SIDEBAR_NAV_IDS = [
  'home',
  'search-performance',
  'links',
  'pipeline',
  'secrets',
  'mcp',
  'docs',
  'chat',
  'write',
  'settings',
] as const satisfies readonly NavItemId[];

export const SETTINGS_SIDEBAR_NAV_IDS = [
  'home',
  'search-performance',
  'links',
  'pipeline',
  'secrets',
  'mcp',
  'docs',
  'chat',
  'write',
  'pages-md',
] as const satisfies readonly NavItemId[];

export function isMiniNavLinkActive(href: string, pathname: string): boolean {
  if (href === '/secrets') return pathname.startsWith('/secrets');
  if (href === '/mcp') return pathname.startsWith('/mcp');
  if (href === '/docs') return pathname.startsWith('/docs');
  if (href === '/write') return pathname.startsWith('/write');
  if (href === '/chat') return pathname.startsWith('/chat');
  if (href === '/pipeline') return pathname.startsWith('/pipeline');
  if (href === '/pages-md') return pathname.startsWith('/pages-md');
  if (href === '/settings') return pathname.startsWith('/settings');
  return pathname === href;
}

export function navHref(item: AppNavItem, trailingQuery: string): string {
  if (item.id === 'home' || item.id === 'pipeline' || item.id === 'secrets' || item.id === 'mcp' || item.id === 'docs' || item.id === 'chat' || item.id === 'write' || item.id === 'pages-md' || item.id === 'settings') {
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
  if (item.id === 'secrets') {
    return pathname === '/secrets' || pathname.startsWith('/secrets/');
  }
  if (item.id === 'mcp') {
    return pathname === '/mcp' || pathname.startsWith('/mcp/');
  }
  if (item.id === 'docs') {
    return pathname === '/docs' || pathname.startsWith('/docs/');
  }
  if (item.id === 'chat') {
    return pathname === '/chat' || pathname.startsWith('/chat/');
  }
  if (item.id === 'write') {
    return pathname === '/write' || pathname.startsWith('/write/');
  }
  if (item.id === 'pages-md') {
    return pathname === '/pages-md' || pathname.startsWith('/pages-md/');
  }
  if (item.id === 'settings') {
    return pathname === '/settings' || pathname.startsWith('/settings/');
  }
  if (item.id === 'home') {
    return pathname === '/home';
  }
  return pathname === item.hrefPath;
}
