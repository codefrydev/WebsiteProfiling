import type { ReactNode } from 'react';
import type { KeywordHistoryRow } from '@/types/api';

/** Shared table column definition for sortable/export tables. */
export interface TableColumn {
  key: string;
  label: string;
  /** Metric help tooltip content for column header. */
  hint?: string | { title?: string; body: string };
  render?: (v: unknown, row?: Record<string, unknown>) => ReactNode;
}

export interface ExportColumn {
  key: string;
  label: string;
}

export interface PaginationLabels {
  showingSlice: string;
  pageOf: string;
  of: string;
  rowsPerPage: string;
  previous: string;
  next: string;
}

export interface GoogleChartCardProps {
  title: string;
  hint?: string;
  ariaLabel: string;
  heightClass?: string;
  children?: ReactNode;
  devData?: unknown;
}

export interface UrlGapRow {
  url: string;
  impressions?: number;
  clicks?: number;
  sessions?: number;
  [key: string]: unknown;
}

export interface UrlJoinData {
  matched?: number;
  crawl_only?: number;
  gsc_only?: number;
  ga4_only?: number;
  lists?: {
    gsc_only?: UrlGapRow[];
    ga4_only?: UrlGapRow[];
    crawl_only?: UrlGapRow[];
  };
  lists_total?: Record<string, number>;
  list_limit?: number;
  [key: string]: unknown;
}

export interface GscQueryRow {
  query: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  [key: string]: unknown;
}

export interface GscPageRow {
  page: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  [key: string]: unknown;
}

export interface GscDailyRow {
  date: string;
  clicks?: number;
  impressions?: number;
  [key: string]: unknown;
}

export interface GscTopLinkingSiteRow {
  site?: string;
  link_count?: number;
  target_page_count?: number;
  [key: string]: unknown;
}

export interface GscTopLinkedPageRow {
  target_page?: string;
  link_count?: number;
  linking_site_count?: number;
  target_in_crawl?: boolean;
  crawl_url?: string;
  [key: string]: unknown;
}

export interface GscTopLinkingTextRow {
  anchor_text?: string;
  link_count?: number;
  [key: string]: unknown;
}

export interface GscSampleLinkRow {
  source_page?: string;
  target_page?: string;
  target_url_on_linking_page?: string;
  anchor_text?: string;
  linking_site?: string;
  discovered_at?: string;
  target_in_crawl?: boolean;
  crawl_url?: string;
  [key: string]: unknown;
}

export interface Ga4PageRow {
  path: string;
  sessions?: number;
  activeUsers?: number;
  screenPageViews?: number;
  engagementRate?: number;
  avgSessionDuration?: number;
  [key: string]: unknown;
}

export interface Ga4DailyRow {
  date: string;
  sessions?: number;
  [key: string]: unknown;
}

export interface Ga4ChannelRow {
  channel?: string;
  sessions?: number;
}

export interface Ga4DeviceRow {
  device?: string;
  sessions?: number;
}

export type KeywordIntent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'other';

export type KeywordSourceKey =
  | 'site'
  | 'gsc'
  | 'suggest'
  | 'youtube'
  | 'questions'
  | 'datamuse'
  | 'wiki';

export type KeywordTrend = 'up' | 'down' | 'flat' | '';

export interface KeywordRow {
  keyword?: string;
  intent?: KeywordIntent | string;
  is_branded?: boolean;
  is_question?: boolean;
  difficulty?: number;
  gsc_position?: number | string;
  gsc_impressions?: number;
  gsc_clicks?: number;
  gsc_ctr?: number;
  traffic_potential?: number;
  opportunity_clicks?: number;
  lost_clicks?: boolean;
  parent_topic?: string;
  trend?: KeywordTrend | string;
  sources?: string[];
  gsc_url?: string;
  recommended_action?: string;
  [key: string]: unknown;
}

export interface CannibalisationPage {
  url: string;
  position?: number | string;
  clicks?: number;
}

export interface CannibalisationItem {
  query: string;
  pages?: CannibalisationPage[];
}

export interface QueryPageMisalignmentItem {
  keyword: string;
  current_url: string;
  suggested_url: string;
  impressions?: number;
  position?: number;
}

export interface KeywordByPageResponse {
  keyword_count?: number;
  cannibalisation?: CannibalisationItem[];
  keywords?: KeywordRow[];
}

export interface KeywordExpandSeedResult {
  web?: string[];
  youtube?: string[];
  questions?: string[];
  [key: string]: string[] | undefined;
}

export type KeywordExpandResult = Record<string, KeywordExpandSeedResult>;

export type KeywordHistoryMap = Record<string, KeywordHistoryRow[]>;

export interface ScatterPoint {
  x: number;
  y: number;
  path?: string;
  query?: string;
  clicks?: number;
}
