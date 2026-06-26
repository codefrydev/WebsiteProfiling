import type { PortfolioGroup } from '@/types/report';

/** Standard API error body. */
export interface ApiErrorBody {
  error: string;
}

/** Pipeline job stored in globalThis. */
export type PipelineJobStatus = 'starting' | 'running' | 'success' | 'error' | 'paused';

export interface PipelineJob {
  status: PipelineJobStatus;
  exitCode: number | null;
  log: string;
  error?: string;
  logTruncated?: boolean;
}

/** In-memory job entry (server only). */
export interface PipelineJobEntry extends PipelineJob {
  cancelled?: boolean;
  finished?: boolean;
  pausedCrawlRunId?: number | null;
}

export interface PipelineJobStore {
  jobs: Map<string, PipelineJobEntry>;
  running: boolean;
}

export interface PipelineUnknownKey {
  key: string;
  value: string;
}

export type PipelineConfigState = Record<string, string | boolean>;
export type LlmConfigState = Record<string, string | boolean>;
export type SecretsState = Record<string, string | boolean>;

export interface SecretsLoadResult {
  state: SecretsState;
  envHints: Record<string, boolean>;
}

export interface SecretsPutBody {
  state?: SecretsState;
}

export type PipelineConfigSource = 'store' | 'defaults';

export interface PipelineConfigLoadResult {
  state: PipelineConfigState;
  unknownKeys: PipelineUnknownKey[];
  source: PipelineConfigSource;
}

export interface LlmConfigLoadResult {
  state: LlmConfigState;
  source: 'store' | 'defaults';
}

export interface RunPostBody {
  command?: string | null | undefined;
  state?: PipelineConfigState;
  unknownKeys?: PipelineUnknownKey[];
  python?: string;
  repoRoot?: string;
  propertyId?: number | null;
}

export interface PipelineConfigPutBody {
  state: PipelineConfigState;
  unknownKeys?: PipelineUnknownKey[];
}

export interface LlmConfigPutBody {
  state: LlmConfigState;
}

export interface JobStatusResponse {
  status: PipelineJobStatus;
  exitCode: number | null;
  log: string;
  error: string | null;
  logTruncated?: boolean;
}

export interface RunPostResponse {
  jobId: string;
}

export interface OkDbPathResponse {
  ok: true;
  dbPath: string;
}

export interface PortfolioCrawlHistoryPoint {
  pagesDiscovered: number;
  titleCoverage: number;
  avgWordCount: number;
  createdAtMs: number;
}

export interface PortfolioResponse {
  groups: PortfolioGroup[];
  crawlHistoryByDomain?: Record<string, PortfolioCrawlHistoryPoint[]>;
}

export interface ReportPayloadResponse {
  payload: Record<string, unknown>;
}

/** Google OAuth / service-account secrets file shape. */
export interface GoogleServiceAccount {
  type: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

export interface GoogleSecrets {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string | null;
  serviceAccount?: GoogleServiceAccount | null;
  gscSiteUrl?: string | null;
  ga4PropertyId?: string | null;
  dateRangeDays?: number;
  authMode?: 'oauth' | 'service_account' | null;
}

export interface GooglePublicStatus {
  connected: boolean;
  hasClientId: boolean;
  gscSiteUrl: string | null;
  ga4PropertyId: string | null;
  dateRangeDays: number;
  authMode: string | null;
  hasPlannerToken?: boolean;
  loginCustomerId?: string | null;
}

export interface GoogleStatusResponse extends GooglePublicStatus {
  lastFetchedAt: string | null;
}

export interface Ga4PropertyOption {
  id: string;
  displayName?: string;
}

export interface GooglePropertiesResponse {
  gscSites?: string[];
  ga4Properties?: Ga4PropertyOption[];
  ga4ListError?: string;
}

export interface IntegrationToast {
  type: 'success' | 'error';
  message: string;
}

export interface GoogleCredentialsPostBody {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  gscSiteUrl?: string;
  ga4PropertyId?: string;
  dateRangeDays?: number;
  developerToken?: string;
  loginCustomerId?: string;
}

export interface GoogleCredentialsUploadBody {
  fileContent: string;
}

export interface KeywordHistoryRow {
  fetched_at: string | null;
  position: number | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
}

export interface KeywordHistoryBatchBody {
  keywords?: unknown[];
  limit?: number;
}

export interface KeywordExpandPostBody {
  seeds?: unknown;
  sources?: unknown;
  propertyId?: number;
  domain?: string;
}

export interface PropertyListItem {
  id: number;
  name: string;
  canonical_domain: string;
  site_url: string | null;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
  google_connected?: boolean;
  google_connected_email?: string | null;
}

export interface PropertiesListResponse {
  properties: PropertyListItem[];
}

export interface AuditSqlExample {
  diff: string;
  title: string;
  text: string;
  sql: string;
  requiresTables?: string[];
}

